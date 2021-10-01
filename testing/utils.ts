import fs from "fs";
import glob from "glob";
import * as yaml from 'js-yaml'
import { Signer, ContractFactory } from "ethers";
import type { ContractData, Config, yamlToken } from "./types";


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
