// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.25;

contract CnV2Mock {
    constructor() payable {}
    
    function VERSION() external pure returns (uint256) {
        return 2;
    }

    function unstaking() external pure returns (uint256) {
        return 1_500_000 ether;
    }

    receive() external payable {}

    function takeOut(uint256 _value) external {
        payable(msg.sender).transfer(_value);
    }

    function deposit() external payable {}
}
