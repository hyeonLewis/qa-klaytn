// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract TestContract {
    uint256 public value;

    function testComputationCost() public pure {
        assembly {
            let x := 0
            for {let i := 0} lt(i, 5) {i := add(i, 1)} {
                x := add(x, 1)
            }
        }
    }

    function testComputationCost2() public {
        assembly {
            let x := 0
            for {let i := 0} lt(i, 5) {i := add(i, 1)} {
                sstore(0, add(sload(0), 1))
            }
        }
    }
}
