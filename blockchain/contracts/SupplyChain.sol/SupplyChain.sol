// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title ChainTrace - Blockchain Supply Chain Tracking
/// @notice Stores products, ownership, temperature checkpoints, scans and an
///         immutable hash-linked audit trail for every supply-chain event.
contract SupplyChain {
    enum State { Manufactured, Shipped, Received, Distributed, Delivered }
    enum Role { None, Manufacturer, Distributor, Retailer, Customer, Admin, Carrier }
    enum EventType {
        Created,            // 0
        Shipped,            // 1
        Received,           // 2
        Distributed,        // 3
        Delivered,          // 4
        Temperature,        // 5
        TransferRequested,  // 6
        TransferConfirmed,  // 7
        Scan,               // 8
        Leg,                // 9  (transport leg, used for carbon footprint)
        Note                // 10
    }

    struct Item {
        uint256 id;
        string sku;          // unique product passport id
        string name;
        string description;
        string imageUrl;
        string category;
        string origin;       // place of manufacture
        address manufacturer;
        address currentOwner;
        State state;
        int256 tempMin;      // temperature limits scaled by 100 (e.g. 450 = 4.50C)
        int256 tempMax;
        uint256 createdAt;
        uint256 updatedAt;
        bool exists;
    }

    struct Checkpoint {
        uint256 index;
        EventType eventType;
        string data;
        int256 temperature;
        bool hasTemperature;
        bool tempAlert;
        address actor;
        uint256 timestamp;
        bytes32 prevHash;
        bytes32 recordHash;
    }

    struct TransferRequest {
        uint256 itemId;
        address from;
        address to;
        bool pending;
        bool completed;
        uint256 requestedAt;
        uint256 completedAt;
    }

    mapping(uint256 => Item) public items;
    uint256 public itemCount;

    mapping(uint256 => Checkpoint[]) private checkpoints;
    mapping(uint256 => bytes32) public lastHash;
    mapping(uint256 => TransferRequest) public transfers;
    mapping(address => Role) public roles;
    mapping(string => bool) public skuUsed;

    // Supplier reputation
    mapping(address => uint256) public deliveries;
    mapping(address => uint256) public disputes;

    // Demo tamper simulation bookkeeping
    mapping(uint256 => mapping(uint256 => string)) private originalData;
    mapping(uint256 => mapping(uint256 => bool)) public tampered;

    uint256 public totalCheckpoints;

    event ItemCreated(uint256 indexed id, string sku, string name, address manufacturer, uint256 timestamp);
    event StateUpdated(uint256 indexed id, State newState, address indexed owner, uint256 timestamp);
    event CheckpointAdded(
        uint256 indexed id,
        uint256 index,
        EventType eventType,
        bytes32 recordHash,
        bytes32 prevHash,
        address indexed actor,
        uint256 timestamp
    );
    event RoleAssigned(address indexed account, Role role);
    event TransferRequested(uint256 indexed id, address indexed from, address indexed to, uint256 timestamp);
    event TransferConfirmed(uint256 indexed id, address indexed from, address indexed to, uint256 timestamp);
    event TemperatureAlert(uint256 indexed id, int256 temperature, uint256 timestamp);
    event DisputeRaised(address indexed supplier, string reason);
    event CheckpointTampered(uint256 indexed id, uint256 index, bool restored);

    modifier onlyAdmin() {
        require(roles[msg.sender] == Role.Admin, "Admins only");
        _;
    }

    modifier onlyRole(Role _role) {
        require(roles[msg.sender] == _role || roles[msg.sender] == Role.Admin, "Unauthorized role");
        _;
    }

    modifier onlyOwner(uint256 _id) {
        require(items[_id].currentOwner == msg.sender, "Only current owner");
        _;
    }

    constructor() {
        roles[msg.sender] = Role.Admin;
        emit RoleAssigned(msg.sender, Role.Admin);
    }

    // ------------------------------------------------------------------
    // Roles
    // ------------------------------------------------------------------
    function assignRole(address _account, Role _role) public onlyAdmin {
        roles[_account] = _role;
        emit RoleAssigned(_account, _role);
    }

    // ------------------------------------------------------------------
    // Products / passport
    // ------------------------------------------------------------------
    function createItem(
        string memory _sku,
        string memory _name,
        string memory _description,
        string memory _imageUrl,
        string memory _category,
        string memory _origin,
        int256 _tempMin,
        int256 _tempMax
    ) public onlyRole(Role.Manufacturer) returns (uint256) {
        require(bytes(_sku).length > 0, "SKU required");
        require(!skuUsed[_sku], "SKU already registered");

        itemCount++;
        Item storage it = items[itemCount];
        it.id = itemCount;
        it.sku = _sku;
        it.name = _name;
        it.description = _description;
        it.imageUrl = _imageUrl;
        it.category = _category;
        it.origin = _origin;
        it.manufacturer = msg.sender;
        it.currentOwner = msg.sender;
        it.state = State.Manufactured;
        it.tempMin = _tempMin;
        it.tempMax = _tempMax;
        it.createdAt = block.timestamp;
        it.updatedAt = block.timestamp;
        it.exists = true;
        skuUsed[_sku] = true;

        emit ItemCreated(itemCount, _sku, _name, msg.sender, block.timestamp);
        _addCheckpoint(itemCount, EventType.Created, string(abi.encodePacked("Manufactured at ", _origin)), 0, false, false);
        return itemCount;
    }

    function shipItem(uint256 _id) public onlyOwner(_id) {
        require(items[_id].state == State.Manufactured, "Must be manufactured");
        items[_id].state = State.Shipped;
        items[_id].updatedAt = block.timestamp;
        emit StateUpdated(_id, State.Shipped, msg.sender, block.timestamp);
        _addCheckpoint(_id, EventType.Shipped, "Shipment dispatched", 0, false, false);
    }

    function receiveItem(uint256 _id) public onlyOwner(_id) {
        require(items[_id].state == State.Shipped, "Must be shipped");
        items[_id].state = State.Received;
        items[_id].updatedAt = block.timestamp;
        emit StateUpdated(_id, State.Received, msg.sender, block.timestamp);
        _addCheckpoint(_id, EventType.Received, "Shipment received", 0, false, false);
    }

    function distributeItem(uint256 _id) public onlyOwner(_id) {
        require(items[_id].state == State.Received, "Must be received");
        items[_id].state = State.Distributed;
        items[_id].updatedAt = block.timestamp;
        emit StateUpdated(_id, State.Distributed, msg.sender, block.timestamp);
        _addCheckpoint(_id, EventType.Distributed, "Out for distribution", 0, false, false);
    }

    function deliverItem(uint256 _id) public onlyOwner(_id) {
        require(items[_id].state == State.Distributed || items[_id].state == State.Received, "Invalid state");
        items[_id].state = State.Delivered;
        items[_id].updatedAt = block.timestamp;
        deliveries[msg.sender] += 1;
        emit StateUpdated(_id, State.Delivered, msg.sender, block.timestamp);
        _addCheckpoint(_id, EventType.Delivered, "Delivered to end recipient", 0, false, false);
    }

    // ------------------------------------------------------------------
    // Ownership transfer (request -> receiver confirmation)
    // ------------------------------------------------------------------
    function requestTransfer(uint256 _id, address _to) public onlyOwner(_id) {
        require(items[_id].exists, "No item");
        require(_to != address(0), "Invalid address");
        require(_to != msg.sender, "Already owner");
        transfers[_id] = TransferRequest(_id, msg.sender, _to, true, false, block.timestamp, 0);
        emit TransferRequested(_id, msg.sender, _to, block.timestamp);
        _addCheckpoint(_id, EventType.TransferRequested, "Transfer requested", 0, false, false);
    }

    function confirmTransfer(uint256 _id) public {
        TransferRequest storage t = transfers[_id];
        require(t.pending, "No pending transfer");
        require(t.to == msg.sender, "Only receiver can confirm");
        t.pending = false;
        t.completed = true;
        t.completedAt = block.timestamp;
        items[_id].currentOwner = t.to;
        items[_id].updatedAt = block.timestamp;
        deliveries[t.to] += 1;
        emit TransferConfirmed(_id, t.from, t.to, block.timestamp);
        emit StateUpdated(_id, items[_id].state, t.to, block.timestamp);
        _addCheckpoint(_id, EventType.TransferConfirmed, "Ownership transferred", 0, false, false);
    }

    function cancelTransfer(uint256 _id) public onlyOwner(_id) {
        require(transfers[_id].pending, "No pending transfer");
        transfers[_id].pending = false;
        _addCheckpoint(_id, EventType.Note, "Transfer cancelled", 0, false, false);
    }

    // ------------------------------------------------------------------
    // Temperature monitoring
    // ------------------------------------------------------------------
    function addTemperature(uint256 _id, int256 _temp, string memory _location) public {
        require(items[_id].exists, "No item");
        require(
            msg.sender == items[_id].currentOwner ||
                roles[msg.sender] == Role.Carrier ||
                roles[msg.sender] == Role.Admin,
            "Not authorized"
        );
        bool hasRange = items[_id].tempMin != 0 || items[_id].tempMax != 0;
        bool alert = false;
        if (hasRange) {
            if (_temp > items[_id].tempMax || _temp < items[_id].tempMin) {
                alert = true;
            }
        }
        items[_id].updatedAt = block.timestamp;
        _addCheckpoint(_id, EventType.Temperature, _location, _temp, true, alert);
        if (alert) emit TemperatureAlert(_id, _temp, block.timestamp);
    }

    // ------------------------------------------------------------------
    // Transport leg (feeds carbon footprint calculator)
    // ------------------------------------------------------------------
    function addLeg(
        uint256 _id,
        string memory _from,
        string memory _to,
        uint256 _distanceKm,
        string memory _mode
    ) public {
        require(items[_id].exists, "No item");
        require(
            msg.sender == items[_id].currentOwner ||
                roles[msg.sender] == Role.Carrier ||
                roles[msg.sender] == Role.Admin,
            "Not authorized"
        );
        string memory payload = string(
            abi.encodePacked(
                "{\"from\":\"", _from,
                "\",\"to\":\"", _to,
                "\",\"km\":", _uintToStr(_distanceKm),
                ",\"mode\":\"", _mode, "\"}"
            )
        );
        _addCheckpoint(_id, EventType.Leg, payload, 0, false, false);
    }

    // ------------------------------------------------------------------
    // Scan recording (fake-product / anti-counterfeit analytics)
    // ------------------------------------------------------------------
    function recordScan(uint256 _id, string memory _location) public {
        require(items[_id].exists, "No item");
        _addCheckpoint(_id, EventType.Scan, _location, 0, false, false);
    }

    // ------------------------------------------------------------------
    // Reputation & disputes
    // ------------------------------------------------------------------
    function raiseDispute(address _supplier, string memory _reason) public onlyAdmin {
        disputes[_supplier] += 1;
        emit DisputeRaised(_supplier, _reason);
    }

    function reliabilityScore(address _account) public view returns (uint256) {
        uint256 d = deliveries[_account];
        uint256 disp = disputes[_account];
        if (d == 0 && disp == 0) return 0;
        uint256 score = 50 + (d * 10);
        if (score > 100) score = 100;
        uint256 penalty = disp * 25;
        if (penalty >= score) return 0;
        return score - penalty;
    }

    // ------------------------------------------------------------------
    // Audit trail / integrity
    // ------------------------------------------------------------------
    function getCheckpointCount(uint256 _id) public view returns (uint256) {
        return checkpoints[_id].length;
    }

    function getCheckpoint(uint256 _id, uint256 _index) public view returns (Checkpoint memory) {
        return checkpoints[_id][_index];
    }

    function getCheckpoints(uint256 _id) public view returns (Checkpoint[] memory) {
        return checkpoints[_id];
    }

    /// @notice Recomputes the full hash chain for an item and reports validity.
    function verifyChain(uint256 _id) public view returns (bool valid, uint256 length) {
        bytes32 prev = bytes32(0);
        uint256 n = checkpoints[_id].length;
        for (uint256 i = 0; i < n; i++) {
            Checkpoint memory cp = checkpoints[_id][i];
            if (cp.prevHash != prev) return (false, n);
            bytes32 h = keccak256(
                abi.encode(
                    cp.prevHash,
                    _id,
                    uint8(cp.eventType),
                    cp.actor,
                    cp.timestamp,
                    cp.data,
                    cp.temperature,
                    cp.hasTemperature
                )
            );
            if (h != cp.recordHash) return (false, n);
            prev = h;
        }
        return (true, n);
    }

    /// @notice Demo helper: mutate a stored checkpoint so integrity checks fail.
    function simulateTamper(uint256 _id, uint256 _index, string memory _newData) public onlyAdmin {
        require(_index < checkpoints[_id].length, "Bad index");
        if (!tampered[_id][_index]) {
            originalData[_id][_index] = checkpoints[_id][_index].data;
        }
        checkpoints[_id][_index].data = _newData;
        tampered[_id][_index] = true;
        emit CheckpointTampered(_id, _index, false);
    }

    /// @notice Demo helper: restore a previously tampered checkpoint.
    function undoTamper(uint256 _id, uint256 _index) public onlyAdmin {
        require(tampered[_id][_index], "Not tampered");
        checkpoints[_id][_index].data = originalData[_id][_index];
        tampered[_id][_index] = false;
        emit CheckpointTampered(_id, _index, true);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------
    function getItem(uint256 _id) public view returns (
        uint256 id,
        string memory sku,
        string memory name,
        string memory description,
        string memory imageUrl,
        string memory category,
        string memory origin,
        address manufacturer,
        address currentOwner,
        State state,
        int256 tempMin,
        int256 tempMax,
        uint256 createdAt,
        uint256 updatedAt,
        bool exists
    ) {
        Item memory it = items[_id];
        return (
            it.id,
            it.sku,
            it.name,
            it.description,
            it.imageUrl,
            it.category,
            it.origin,
            it.manufacturer,
            it.currentOwner,
            it.state,
            it.tempMin,
            it.tempMax,
            it.createdAt,
            it.updatedAt,
            it.exists
        );
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------
    function _addCheckpoint(
        uint256 _id,
        EventType _type,
        string memory _data,
        int256 _temp,
        bool _hasTemp,
        bool _alert
    ) internal {
        bytes32 prev = lastHash[_id];
        uint256 idx = checkpoints[_id].length;
        uint256 ts = block.timestamp;
        bytes32 h = keccak256(
            abi.encode(prev, _id, uint8(_type), msg.sender, ts, _data, _temp, _hasTemp)
        );
        checkpoints[_id].push(
            Checkpoint(idx, _type, _data, _temp, _hasTemp, _alert, msg.sender, ts, prev, h)
        );
        lastHash[_id] = h;
        totalCheckpoints++;
        emit CheckpointAdded(_id, idx, _type, h, prev, msg.sender, ts);
    }

    function _uintToStr(uint256 _v) internal pure returns (string memory) {
        if (_v == 0) return "0";
        uint256 temp = _v;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (_v != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + (_v % 10)));
            _v /= 10;
        }
        return string(buffer);
    }
}
