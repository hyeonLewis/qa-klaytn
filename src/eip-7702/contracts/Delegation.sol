// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.25;

contract Delegation {
    uint256 public count;

    function increment() external {
        count++;
    }

    // It will increase count2 of Delegation2 contract
    function callIncrement(address _addr) external {
        (bool success, ) = _addr.call(abi.encodeWithSignature("increment()"));
        require(success, "Call failed");
    }

    function getCount(address _addr) external view returns (uint256) {
        (bool success, bytes memory data) = _addr.staticcall(abi.encodeWithSignature("count()"));
        require(success, "Staticcall failed");
        return abi.decode(data, (uint256));
    }

    // callcode has been deprecated

    // It will increase count of Delegation contract
    function delegatecallIncrement(address _addr) external {
        (bool success, ) = _addr.delegatecall(abi.encodeWithSignature("increment()"));
        require(success, "Delegatecall failed");
    }

    function callcodeIncrement(address _addr) external {
        bytes memory data = abi.encodeWithSignature("increment()");
        assembly {
            let success := callcode(gas(), _addr, 0, add(data, 0x20), mload(data), 0, 0)
            if iszero(success) {
                revert(0, 0)
            }
        }
    }

    function getCodeFields(address _addr) external view returns (bytes memory code, bytes32 codehash, uint256 size) {
        // Testing EXTCODESIZE, EXTCODECOPY, EXTCODEHASH
        return (_addr.code, _addr.codehash, _addr.code.length);
    }
}