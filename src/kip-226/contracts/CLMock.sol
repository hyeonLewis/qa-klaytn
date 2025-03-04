// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.25;

interface IWKAIA {
    function deposit() external payable;

    function withdraw(uint256 _amount) external;
}

contract CLMock {
    address public wkaia;

    receive() external payable {}

    constructor(address _wkaia) payable {
        wkaia = _wkaia;
        IWKAIA(wkaia).deposit{value: msg.value}();
    }

    function takeOut(uint256 _value) external {
        IWKAIA(wkaia).withdraw(_value);
        payable(msg.sender).call{value: _value}("");
    }

    function deposit() external payable {
        IWKAIA(wkaia).deposit{value: msg.value}();
    }
}
