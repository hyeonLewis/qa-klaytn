// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.25;

interface IRegistry {
    function register(string memory name, address addr, uint256 activation) external;

    function getActiveAddr(string memory name) external view returns (address);
}
