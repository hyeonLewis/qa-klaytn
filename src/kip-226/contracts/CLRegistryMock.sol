// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.25;

import "openzeppelin-contracts-5.0/access/Ownable.sol";
import "openzeppelin-contracts-5.0/utils/structs/EnumerableSet.sol";

contract CLRegistryMock {
    using EnumerableSet for EnumerableSet.UintSet;

    /* ========== STRUCT ========== */

    struct CLInfo {
        /// @dev The node ID of the validator
        address nodeId;
        /// @dev The governance committee ID of the validator
        uint256 gcId;
        /// @dev The address of the CLDEX pool
        address clPool;
    }

    /* ========== CONSTANTS ========== */

    address private constant ZERO_ADDRESS = address(0);

    /* ========== STATE VARIABLES ========== */

    EnumerableSet.UintSet private _gcIds;
    mapping(uint256 => CLInfo) public clPoolList; // gcId -> CL pair

    /* ========== PAIR MANAGEMENT ========== */

    /// @dev See {ICLRegistry-addCLPair}
    function addCLPair(CLInfo[] calldata list) external {
        for (uint i = 0; i < list.length; i++) {
            uint256 gcId = list[i].gcId;
            require(
                _validateCLPairInput(list[i]),
                "CLRegistry::addCLPair: Invalid pair input"
            );
            require(
                !_isExistPair(gcId),
                "CLRegistry::addCLPair: GC ID does exist"
            );
            clPoolList[gcId] = list[i];
            _addGCId(gcId);
        }
    }

    /// @dev See {ICLRegistry-removeCLPair}
    function removeCLPair(uint256 gcId) external {
        require(gcId != 0, "CLRegistry::removeCLPair: Invalid GC ID");
        require(
            _isExistPair(gcId),
            "CLRegistry::removeCLPair: GC ID does not exist"
        );

        delete clPoolList[gcId];
        _removeGCId(gcId);
    }

    /// @dev See {ICLRegistry-updateCLPair}
    function updateCLPair(CLInfo[] calldata list) external {
        for (uint i = 0; i < list.length; i++) {
            uint256 gcId = list[i].gcId;
            require(
                _validateCLPairInput(list[i]),
                "CLRegistry::updateCLPair: Invalid pair input"
            );
            require(
                _isExistPair(gcId),
                "CLRegistry::updateCLPair: GC ID does not exist"
            );
            clPoolList[gcId] = list[i];
        }
    }

    /// @dev See {ICLRegistry-getAllCLs}
    function getAllCLs()
        external
        view
        returns (address[] memory, uint256[] memory, address[] memory)
    {
        uint256 len = _gcIds.length();
        address[] memory nodeIds = new address[](len);
        uint256[] memory gcIds = new uint256[](len);
        address[] memory clPools = new address[](len);

        for (uint i = 0; i < len; i++) {
            CLInfo storage clInfo = clPoolList[_gcIds.at(i)];
            nodeIds[i] = clInfo.nodeId;
            gcIds[i] = clInfo.gcId;
            clPools[i] = clInfo.clPool;
        }
        return (nodeIds, gcIds, clPools);
    }

    // @dev Return all GC IDs
    function getAllGCIds() public view returns (uint256[] memory) {
        return _gcIds.values();
    }

    /// @dev Validate property values of `CLInfo`
    function _validateCLPairInput(
        CLInfo calldata pairInput
    ) internal pure returns (bool) {
        return
            pairInput.gcId != 0 &&
            pairInput.nodeId != ZERO_ADDRESS &&
            pairInput.clPool != ZERO_ADDRESS;
    }

    /// @dev Return true if a pair exists with given `gcId`
    function _isExistPair(uint256 gcId) internal view returns (bool) {
        return clPoolList[gcId].gcId != 0;
    }

    /// @dev Add GC ID to the global GC ID list. If it exists already, do nothing
    function _addGCId(uint256 gcId) internal {
        _gcIds.add(gcId);
    }

    /// @dev Remove GC ID to the global GC ID list. If it does not exist, do nothing
    function _removeGCId(uint256 gcId) internal {
        _gcIds.remove(gcId);
    }
}
