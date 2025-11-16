# BlockStreet Bot

## Overview
This Node.js bot automates interactions with the BlockStreet DeFi platform, a liquidity infrastructure layer for tokenized assets, decentralized lending, leverage, and yield generation on the Ethereum mainnet and other chains.  It enables multi-wallet management, Ethereum-signed logins, CAPTCHA solving via Capsolver, proxy rotation for anonymity, and actions like swaps, supplying liquidity, borrowing, repaying, withdrawing, and daily shares to optimize capital efficiency and participate in platform activities.  Designed for users farming yields or engaging in DeFi routines, it includes stealth features like random user agents and delays to mimic human behavior.[1][2][3][4]

Developed by sinak1023. Join the crypto updates on Telegram channel @ostadkachal for tips and announcements.[5]

Repository: https://github.com/sinak1023/blockstreet-bot

## Features
- **Multi-Wallet Support**: Load unlimited Ethereum wallets via environment variables for parallel operations.
- **Proxy Rotation**: Automatically cycles through proxies to evade rate limits or bans, with fallback to direct connections.
- **CAPTCHA Integration**: Solves Turnstile CAPTCHAs using Capsolver API for seamless logins.
- **Interactive Menu**: Choose actions like single swaps, supplies, or full daily runs with configurable cycles.
- **Stealth Mode**: Generates random user agents, timestamps, and delays (3-15 seconds) to avoid detection.
- **Daily Automation**: Runs continuous cycles of shares, swaps (up to 5 per cycle), and DeFi actions (supply/withdraw/borrow/repay) every 24 hours.
- **Error Handling**: Retries failed requests (up to 3 times), skips non-proxy errors, and logs successes/errors with colors.
- **Token Management**: Fetches and selects from available tokens for balanced operations across assets.

The bot focuses on small random amounts (0.001-0.0015 tokens) to simulate organic activity, ideal for yield optimization on platforms like BlockStreet.[6][7]

## Requirements
- Node.js version 18 or higher (tested on LTS).
- Ethereum mainnet private keys (no mnemonic support; full keys only).
- Capsolver account with API key (free tier may suffice for low volume; required for logins).
- Optional: Residential or datacenter proxies for high-volume runs (SOCKS5/HTTP supported).
- Internet connection with access to blockstreet.money API (https://api.blockstreet.money).
- Basic knowledge of Node.js, Ethereum, and DeFi risks (gas fees apply to on-chain actions).

No additional hardware needed; runs on standard servers or local machines.[8]

## Installation
1. **Clone the Repository**:
   ```
   git clone https://github.com/sinak1023/blockstreet-bot.git
   cd blockstreet-bot
   ```

2. **Initialize Project**:
   ```
   npm init -y
   ```

3. **Install Dependencies**:
   The bot requires these packages for Ethereum handling, HTTP requests, proxies, and environment config:
   ```
   npm install ethers@6 dotenv axios https-proxy-agent readline
   ```
   - `ethers`: For wallet creation and message signing.
   - `dotenv`: Loads .env variables.
   - `axios`: API calls with proxy support.
   - `https-proxy-agent`: Handles proxy agents.
   - `readline`: Interactive console input.

4. **Verify Setup**:
   Run `node --version` to confirm Node.js >=18. Ensure no firewall blocks outbound HTTPS to api.blockstreet.money.

## Configuration
### Environment Variables (.env)
Create a `.env` file in the project root. Add your wallet private keys (prefixed for multi-wallet) and API keys. Never commit this file to Git (add to .gitignore).

Example `.env`:
```
# Wallet Private Keys (unlimited; use PRIVATE_KEY_1, PRIVATE_KEY_2, etc.)
PRIVATE_KEY_1=0xYourFirstPrivateKeyHere (remove 0x if needed)
PRIVATE_KEY_2=0xYourSecondPrivateKeyHere

# Capsolver API Key (required for CAPTCHA)
CAPSOLVER_API_KEY=your_capsolver_api_key_here

# Optional Invite Code (default: Eu8K2T)
INVITE_CODE=YourCustomInviteIfAny

# Optional Headers (inspect blockstreet.money for updates; usually not needed)
TIMESTAMP=YourTimestampIfRequired
EXAMPLE_SIGNATURE=YourSignatureExample
FINGERPRINT=YourBrowserFingerprint
ABS=YourABSValue
TOKEN=YourAuthToken
```

- **Private Keys**: Start with `0x` or raw hex. Bot creates read-only wallets.
- **Capsolver**: Sign up at capsolver.com; add funds for solves (~$0.001 per CAPTCHA). Site key is hardcoded for BlockStreet.
- Load order: Bot scans env for all `PRIVATE_KEY_*` vars automatically.

### Proxies File (proxies.txt)
Optional but recommended for >1 wallet to rotate IPs. Create `proxies.txt` in the project root.

Format (one per line):
- Basic: `ip:port` (e.g., `192.168.1.1:8080`)
- Auth: `ip:port:username:password` (e.g., `192.168.1.1:8080:user:pass`)
- HTTP/HTTPS: Prefix optional; bot parses and converts to `http://user:pass@ip:port`.

Example:
```
45.67.89.12:3128
78.90.12.34:8080:myuser:mypass
```

Bot loads and rotates them per request; empty file = no proxies (direct connection).

### Notes on Config
- **Security**: Use a VPS (e.g., AWS, DigitalOcean) for 24/7 runs. Never expose private keys.
- **Gas Optimization**: Bot uses mainnet (chain ID 1); monitor via Etherscan.
- **Updates**: If BlockStreet changes API (e.g., endpoints like `/swap`), edit the `BlockStreetClient` class.

## Usage
1. **Start the Bot**:
   ```
   node bot.js
   ```
   - Banner displays "BlockStreet Bot V3".
   - Loads proxies (if any) and scans .env for wallets.
   - Validates wallets and shows addresses.

2. **Interactive Menu**:
   After setup, select an action:
   - **1. Swap**: Choose FROM/TO tokens, enter amount. Executes fixed swaps per cycle.
   - **2. Supply**: Select token, amount. Supplies liquidity (2x per cycle in daily mode).
   - **3. Withdraw**: Select token, amount. Withdraws supplied assets.
   - **4. Borrow**: Select token, amount. Borrows against collateral.
   - **5. Repay**: Select token, amount. Repays borrowed amounts.
   - **6. Daily Full Run**: Automates everything—daily share, 5 swaps/cycle (random owned assets), and DeFi actions (supply/withdraw 2x, borrow/repay 1x). Runs indefinitely every 24 hours.
   - **7. Exit**: Stops the bot.

   For each: Enter cycles (e.g., 5) per wallet. Bot solves CAPTCHA, logs in once, fetches tokens, executes, and rotates proxies.

3. **Example Flow (Daily Run)**:
   - Logs in via signed message (EIP-4361 style: nonce, URI, etc.).
   - Claims daily share.
   - Fetches balances/supplies/earn.
   - Per cycle: Random swaps (if supplies >0), then actions with random tokens/amounts.
   - Delays between actions; 24h cooldown with live timer.
   - Logs: Colored output (e.g., [✅] Swapped 0.00123 USDC -> 0.00145 DAI).

4. **Outputs and Logs**:
   - Console: Real-time status (info/warn/error/success/loading).
   - No file logging; redirect with `node bot.js > bot.log 2>&1`.
   - Errors: Proxy fails retry without proxy; business errors (e.g., insufficient balance) skip and continue.

5. **Stopping/Interrupting**:
   - Ctrl+C to exit menu or daily loop.
   - For daily runs, it loops forever—monitor via screen/tmux on servers.

## Troubleshooting
- **CAPTCHA Fails**: Check Capsolver balance/API key. Increase delay or use better proxies. Error: "CAPTCHA timeout".
- **Proxy Errors (492/Squid)**: Invalid/dead proxies; rotate or run without. Bot falls back automatically.
- **Login Fails**: Invalid signature/nonce; ensure chain ID=1, message format matches. Check invite code.
- **No Tokens/Balances**: API change; verify `/swap/token_list` endpoint. Add try-catch for fetches.
- **Wallet Issues**: Invalid private key? Check format (64 hex chars). Gas too low? Fund wallets.
- **Rate Limits**: Too fast? Increase `randomDelay` min/max. Use more proxies.
- **Dependencies**: Missing module? Re-run `npm install`. Node version low? Upgrade.
- **API Changes**: BlockStreet updates (e.g., new headers)? Inspect network tab on blockstreet.money/dashboard and update SAMPLE_HEADERS or request method.

For support: Open issues on GitHub or message @ostadkachal in telegram.

## Risks and Disclaimer
- **Financial Risks**: DeFi actions (swaps/borrows) incur gas fees, slippage, and liquidation risks. Small amounts recommended; bot uses random low values to minimize.
- **Platform ToS**: Automation may violate BlockStreet terms; use responsibly. No liability for bans/losses.
- **Security**: Private keys in .env—encrypt or use secrets managers. Proxies must be trusted.
- **Legal**: Crypto trading is volatile; not financial advice. Comply with local laws (e.g., KYC if needed).[9][10]
- **Educational Use**: This bot is open-source for learning; test on low-value wallets first. BlockStreet is a DeFi protocol for tokenized assets—research USD1 stablecoin integration.[11][5]

Contribute via pull requests. Updates tracked in changelog.md (add if needed). Happy farming!
