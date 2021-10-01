import fs from "fs";
import glob from "glob";
import * as yaml from 'js-yaml'
import { Signer, ContractFactory } from "ethers";
import type { ContractData, Config, yamlToken } from "./types";

// Get a ContractFactory by a contract name from ./artifacts dir
export function getContractFactory(name: string, signer: Signer): ContractFactory {
  // Find all .json files with such name in ./artifacts
  const files: string[] = glob.sync(`./artifacts/**/${name}.json`);
  // Throw an exception if the number of files found isn't 1
  if (files.length == 0) throw `Contract ${name}.sol not found`;
  // Get the first path
  const path: string = files[0];
  // Read the file from path
  const file: Buffer = fs.readFileSync(path);
  // Parse the Buffer to ContractData
  const data: ContractData = JSON.parse(file.toString());
  // Load ContractFactory from the ContractData
  const factory: ContractFactory = new ContractFactory(data.abi, data.bytecode, signer);
  return factory;
}

/// A function to stop an async thread for a few miliseconds
export function sleep(ms: number): Promise<Function> {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// Function to load network configuration from local .yaml file
export function loadConfig(path: string): Config {
  return yaml.load(fs.readFileSync(path, 'utf-8')) as Config;
}


// Function to load single tokens from local .yaml file
export function loadSingleTokens(path: string): yamlToken{
  return yaml.load(fs.readFileSync(path, 'utf-8')) as yamlToken;
}

// Function to write tokens' addresses to local .yaml file
export function writeSingleTokens(path: string, formatedTokens:any) {
  fs.writeFileSync(path, yaml.dump(formatedTokens));
}
