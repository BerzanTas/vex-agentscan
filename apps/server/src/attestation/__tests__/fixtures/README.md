# Real receipts, fetched live

Every file here is a real transaction on a real chain, fetched from the chain's public RPC on
2026-09-04 and reduced to the fields the attestation verifier reads: the receipt status, the block
number, the transaction's `from` and `to`, and the logs (address, topics, data). Nothing is
hand-written and nothing is edited; addresses are lowercased, which is what the reader does too.

Nothing here is a secret: these are public chain records of public token launches.

| file | chain | what it is |
|---|---|---|
| `pools-v3-gateway-launch.json` | Robinhood 4663 | tx `0x27dbb65a...` - a pools.fun V3 gateway launch by launcher `0x848e5738...`, emitting `GatewayLaunch` from the V3 gateway `0x2bc81783...` |
| `virtuals-robinhood-prelaunch.json` | Robinhood 4663 | tx `0x7cc33439...` - the CREATOR's `preLaunch`, sent by `0x33ef6673...` to BondingV5 `0xd4ccbfa3...`, emitting `PreLaunched` for token `0xd1ef7097...` |
| `virtuals-base-keeper-launch.json` | Base 8453 | tx `0x9eca4cb5...` - the KEEPER's `launch()` for the agent created in the Base run, sent by keeper `0x81f7ca6a...`. It emits `Launched`, never `PreLaunched`, and its sender is not the creator. It exists here as the negative case: this transaction must never verify a creator attestation. |

They were captured with `eth_getTransactionReceipt` + `eth_getTransactionByHash` against
`https://rpc.mainnet.chain.robinhood.com` and `https://mainnet.base.org`.
