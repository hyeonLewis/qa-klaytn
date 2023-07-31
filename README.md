# vrank-metric

## Prerequisites

1. Install typescript
2. Go to [here](https://github.com/hyeonLewis/klaytn/tree/test-logs) and build kcn
3. Running CNs with proper Prometheus and RPC ports
4. Fill logs in src/log.txt

## Building

```
npm install
```

## Running

```
npx ts-node index.ts // To query metrics and save data in table format
npx ts-node logParser.ts // To parse log.txt and save in table format
```
