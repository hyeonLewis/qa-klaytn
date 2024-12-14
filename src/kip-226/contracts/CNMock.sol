// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.25;

interface ABMock {
    function reviseRewardAddress(address _rewardAddress) external;
}

contract CNMock {
    constructor() payable {}

    function VERSION() external pure returns (uint256) {
        return 1;
    }

    function takeOut(uint256 _value) external {
        payable(msg.sender).transfer(_value);
    }

    function reviseRewardAddress(address _rewardAddress) external {
        ABMock(0x0000000000000000000000000000000000000400).reviseRewardAddress(_rewardAddress);
    }

    function deposit() external payable {}
}
