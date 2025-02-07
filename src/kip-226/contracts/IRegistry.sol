// Copyright 2023 The klaytn Authors
// This file is part of the klaytn library.
//
// The klaytn library is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// The klaytn library is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with the klaytn library. If not, see <http://www.gnu.org/licenses/>.

// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.18;

interface IRegistry {
    /* ========== MUTATORS ========== */
    /// @dev Registers a new system contract.
    function register(string memory name, address addr, uint256 activation) external;

    /// @dev Transfers ownership to newOwner.
    function transferOwnership(address newOwner) external;

    /* ========== GETTERS ========== */
    /// @dev Returns an address for active system contracts registered as name if exists.
    /// It returns a zero address if there's no active system contract with name.
    function getActiveAddr(string memory name) external view returns (address);

    /// @dev Returns all names of registered system contracts.
    function getAllNames() external view returns (string[] memory);

    /// @dev Returns owner of contract.
    function owner() external view returns (address);
}
