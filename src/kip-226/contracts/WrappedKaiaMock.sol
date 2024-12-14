// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.25;

contract WrappedKaiaMock {
    function balanceOf(address _account) external view returns (uint256) {
        return _account.balance;
    }
}
