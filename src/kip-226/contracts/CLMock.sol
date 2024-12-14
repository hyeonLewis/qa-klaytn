// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.25;

contract CLMock {
    constructor() payable {}

    function takeOut(uint256 _value) external {
        payable(msg.sender).transfer(_value);
    }

    function deposit() external payable {}
}
