// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./ShitCoin.sol";

contract ShitCoinFactory {
    event Cloned(address indexed clone, uint256 time);
    event Created(address indexed clone, uint256 time);

    address private _clone;

    function create(address contract_, string memory name, string memory symbol, uint256 totalSupply) public returns (address clone) {
        clone = copy(contract_);
        ShitCoin(clone).cloneConstructor(name, symbol, totalSupply, msg.sender);
        emit Created(_clone, now);
    }

    function copy(address contract_) public returns (address clone) {
        clone = Clones.clone(contract_);
        emit Cloned(clone, now);
        _clone = clone;
    }
}