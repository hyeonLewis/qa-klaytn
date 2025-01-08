// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.25;

interface WrappedKaia {
    function deposit() external payable;

    function withdraw(uint256 amount) external;
}

interface IStakingTracker {
    function refreshStake(address staking) external;
}

contract MockCLPool {
    address public stakingTracker;
    address public wrappedKaia;

    constructor(address _stakingTracker, address _wrappedKaia) {
        stakingTracker = _stakingTracker;
        wrappedKaia = _wrappedKaia;
    }

    receive() external payable {}

    function deposit() external payable {
        WrappedKaia(wrappedKaia).deposit{value: msg.value}();
        IStakingTracker(stakingTracker).refreshStake(address(this));
    }

    function withdraw(address to, uint256 amount) external {
        WrappedKaia(wrappedKaia).withdraw(amount);
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
        IStakingTracker(stakingTracker).refreshStake(address(this));
    }
}
