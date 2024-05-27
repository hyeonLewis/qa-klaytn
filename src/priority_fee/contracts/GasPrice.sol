// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.25;

contract GasPrice {
    uint256 count;
    uint256 gasPrice;
    uint256 baseFee;

    function increaseCount() external {
        count++;
        gasPrice = tx.gasprice;
        baseFee = block.basefee;
    }

    function getGasPrice() external view returns (uint256, uint256) {
        return (gasPrice, baseFee);
    }
}
