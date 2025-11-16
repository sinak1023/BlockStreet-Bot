const fs = require('fs');
const readline = require('readline');
const { ethers } = require('ethers');
const dotenv = require('dotenv');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

dotenv.config();

const colors = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    white: "\x1b[37m",
    bold: "\x1b[1m",
};

const logger = {
    info: (msg) => console.log(`${colors.white}[✓] ${msg}${colors.reset}`),
    warn: (msg) => console.log(`${colors.yellow}[⚠] ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}[✗] ${msg}${colors.reset}`),
    success: (msg) => console.log(`${colors.green}[✅] ${msg}${colors.reset}`),
    loading: (msg) => console.log(`${colors.cyan}[⟳] ${msg}${colors.reset}`),
    banner: () => {
        console.log(`${colors.cyan}${colors.bold}`);
        console.log(`----------------------------------------`);
        console.log(`           BlockStreet Bot    `);
        console.log(`           kachal airdrop bots   `);
        console.log(`           Tx God Mod Actived    `);
        console.log(`----------------------------------------${colors.reset}`);
        console.log();
    }
};

// Dynamic Random User-Agent generator (improved for full randomness)
const generateRandomUA = () => {
    const platforms = [
        { os: 'Windows NT 10.0; Win64; x64', browser: 'Chrome', version: '120' },
        { os: 'Macintosh; Intel Mac OS X 10_15_7', browser: 'Chrome', version: '120' },
        { os: 'X11; Linux x86_64', browser: 'Firefox', version: '115' },
        { os: 'Windows NT 10.0; Win64; x64', browser: 'Edge', version: '120' },
        { os: 'Windows NT 10.0; Win64; x64', browser: 'Opera', version: '106' }
    ];
    const platform = platforms[Math.floor(Math.random() * platforms.length)];
    const minorVersion = Math.floor(Math.random() * 10) + 1;  // Random minor, e.g., 120.1-120.9
    if (platform.browser === 'Firefox') {
        return `Mozilla/5.0 (${platform.os}; rv:${platform.version}.${minorVersion}) Gecko/20100101 Firefox/${platform.version}.${minorVersion}`;
    }
    let ua = `Mozilla/5.0 (${platform.os}) AppleWebKit/537.36 (KHTML, like Gecko) ${platform.browser}/${platform.version}.0.${minorVersion}000 Safari/537.36`;
    if (platform.browser === 'Opera') ua += ` OPR/${platform.version}.${minorVersion}`;
    if (platform.browser === 'Edge') ua = ua.replace('Chrome', 'Edg');
    return ua;
};

// Random delay
const randomDelay = (min = 3000, max = 15000) => new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));

// Parse proxy
const parseProxy = (proxyLine) => {
    let proxy = proxyLine.trim();
    if (!proxy) return null;
    proxy = proxy.replace(/^https?:\/\//, '');
    const specialMatch = proxy.match(/^([^:]+):(\d+)@(.+):(.+)$/);
    if (specialMatch) {
        const [, host, port, user, pass] = specialMatch;
        return `http://${user}:${pass}@${host}:${port}`;
    }
    const parts = proxy.split(':');
    if (parts.length === 4 && !isNaN(parts[1])) {
        const [host, port, user, pass] = parts;
        return `http://${user}:${pass}@${host}:${port}`;
    }
    return `http://${proxy}`;
};

// Read proxies
const readProxies = (filePath) => {
    if (!fs.existsSync(filePath)) return [];
    try {
        const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
        return lines.map(parseProxy).filter(Boolean);
    } catch (err) {
        logger.error(`Error reading proxies.txt: ${err.message}`);
        return [];
    }
};

// Capsolver (unchanged)
async function solveCaptcha(siteKey, pageUrl) {
    const apiKey = process.env.CAPSOLVER_API_KEY;
    if (!apiKey) {
        throw new Error('Capsolver API key missing in .env (CAPSOLVER_API_KEY)');
    }
    logger.loading('Solving Turnstile CAPTCHA with Capsolver...');

    const submitUrl = 'https://api.capsolver.com/createTask';
    const taskData = {
        clientKey: apiKey,
        task: {
            type: 'AntiTurnstileTaskProxyLess',
            websiteURL: pageUrl,
            websiteKey: siteKey,
            metadata: { action: 'login' }
        }
    };

    try {
        const submitRes = await axios.post(submitUrl, taskData, { headers: { 'Content-Type': 'application/json' } });
        if (submitRes.data.errorId !== 0) {
            throw new Error(`Capsolver submit failed: ${submitRes.data.errorDescription}`);
        }
        const taskId = submitRes.data.taskId;
        logger.info(`Task submitted: ID ${taskId}`);

        const resultUrl = 'https://api.capsolver.com/getTaskResult';
        let attempts = 0;
        while (attempts < 30) {
            await randomDelay(2000, 5000);
            const resultRes = await axios.post(resultUrl, { clientKey: apiKey, taskId }, { headers: { 'Content-Type': 'application/json' } });
            if (resultRes.data.status === 'ready') {
                logger.success('CAPTCHA solved successfully!');
                return resultRes.data.solution.token;
            }
            if (resultRes.data.status === 'processing') {
                logger.loading(`CAPTCHA still processing (attempt ${++attempts}/30)...`);
                continue;
            }
            throw new Error(`Capsolver solve failed: ${resultRes.data.errorDescription}`);
        }
        throw new Error('CAPTCHA timeout');
    } catch (error) {
        throw new Error(`CAPTCHA error: ${error.message}`);
    }
}

// SAMPLE_HEADERS
const SAMPLE_HEADERS = {
    timestamp: process.env.TIMESTAMP || '',
    signatureHeader: process.env.EXAMPLE_SIGNATURE || '',
    fingerprint: process.env.FINGERPRINT || '',
    abs: process.env.ABS || '',
    token: process.env.TOKEN || '',
    origin: 'https://blockstreet.money'
};

class BlockStreetClient {
    constructor(wallet, proxy = null, proxies = []) {
        this.wallet = wallet;
        this.sessionId = null;
        this.proxies = proxies;  // List for rotation
        this.currentProxyIdx = 0;
        let agent = null;
        if (proxy) {
            try {
                agent = new HttpsProxyAgent(proxy);
            } catch (e) {
                logger.error(`Proxy agent failed: ${e.message}`);
                agent = null;  // Fallback to no proxy
            }
        }
        this.client = axios.create({
            baseURL: 'https://api.blockstreet.money/api',
            httpsAgent: agent,
            timeout: 30000,
            headers: {
                accept: 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                priority: 'u=1, i',
                'sec-ch-ua': '"Brave";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site',
                'sec-gpc': '1',
                Referer: 'https://blockstreet.money/',
                Origin: SAMPLE_HEADERS.origin
            }
        });
    }

    // Get next proxy or null
    getNextProxy() {
        if (!this.proxies.length) return null;
        const proxy = this.proxies[this.currentProxyIdx % this.proxies.length];
        this.currentProxyIdx++;
        return proxy;
    }

    // Request with retry and proxy rotation
    async request(options, auth = true, maxRetries = 3) {
        for (let retry = 0; retry <= maxRetries; retry++) {
            const proxy = this.getNextProxy();
            const tempClient = axios.create({
                ...this.client.defaults,
                httpsAgent: proxy ? new HttpsProxyAgent(proxy) : null
            });
            const config = {
                ...options,
                headers: {
                    ...options.headers,
                    'User-Agent': generateRandomUA(),  // Random UA every request
                    fingerprint: SAMPLE_HEADERS.fingerprint,
                    timestamp: Date.now().toString(),
                    Cookie: auth ? (this.sessionId || '') : 'gfsessionid=',
                    origin: SAMPLE_HEADERS.origin
                }
            };
            if (SAMPLE_HEADERS.token) config.headers.token = SAMPLE_HEADERS.token;
            if (options.headers && options.headers['content-type']) {
                config.headers['content-type'] = options.headers['content-type'];
            }

            try {
                const res = await tempClient.request({ ...config, validateStatus: () => true });

                // Update session
                const setCookie = res.headers['set-cookie'];
                if (setCookie) {
                    let sessionCookie = null;
                    if (Array.isArray(setCookie)) {
                        sessionCookie = setCookie.find(c => c.startsWith('gfsessionid='));
                    } else if (setCookie.startsWith('gfsessionid=')) {
                        sessionCookie = setCookie;
                    }
                    if (sessionCookie) this.sessionId = sessionCookie.split(';')[0];
                }

                // Check for proxy/Squid error (HTML or 492)
                const isProxyError = res.status === 492 || (res.data && typeof res.data === 'string' && res.data.includes('The requested URL could not be retrieved'));
                if (isProxyError) {
                    logger.warn(`Proxy/Squid error (retry ${retry + 1}/${maxRetries}): ${res.status}. Rotating proxy.`);
                    if (retry < maxRetries) {
                        await randomDelay(5000, 10000);  // Delay before retry
                        continue;
                    }
                    logger.error('All proxies failed. Retrying without proxy.');
                    return this.requestWithoutProxy(options, auth);  // Fallback to no proxy
                }

                if (res.data && (res.data.code === 0 || res.data.code === '0')) {
                    return res.data.data || res.data;
                }
                if (res.status >= 200 && res.status < 300) {
                    return res.data;
                }
                logger.error(`Request failed: Status ${res.status}, Body: ${JSON.stringify(res.data)}`);
                throw new Error(res.data?.message || res.data?.errorDescription || `HTTP ${res.status}`);
            } catch (err) {
                logger.warn(`Request error (retry ${retry + 1}/${maxRetries}): ${err.message}`);
                if (retry < maxRetries) {
                    await randomDelay(5000, 10000);
                    continue;
                }
                throw err;
            }
        }
    }

    // Fallback request without proxy
    async requestWithoutProxy(options, auth = true) {
        const noProxyClient = axios.create({
            ...this.client.defaults,
            httpsAgent: null  // No proxy
        });
        const config = {
            ...options,
            headers: {
                ...options.headers,
                'User-Agent': generateRandomUA(),
                timestamp: Date.now().toString(),
                Cookie: auth ? (this.sessionId || '') : 'gfsessionid=',
                origin: SAMPLE_HEADERS.origin
            }
        };
        try {
            const res = await noProxyClient.request({ ...config, validateStatus: () => true });
            // Update session etc. (same as above)
            const setCookie = res.headers['set-cookie'];
            if (setCookie) {
                let sessionCookie = null;
                if (Array.isArray(setCookie)) {
                    sessionCookie = setCookie.find(c => c.startsWith('gfsessionid='));
                } else if (setCookie.startsWith('gfsessionid=')) {
                    sessionCookie = setCookie;
                }
                if (sessionCookie) this.sessionId = sessionCookie.split(';')[0];
            }

            if (res.data && (res.data.code === 0 || res.data.code === '0')) {
                return res.data.data || res.data;
            }
            if (res.status >= 200 && res.status < 300) {
                return res.data;
            }
            throw new Error(res.data?.message || `HTTP ${res.status}`);
        } catch (err) {
            throw new Error(`No-proxy fallback failed: ${err.message}`);
        }
    }

    // Login (with retry)
    async login(captchaToken, maxRetries = 3) {
        for (let retry = 0; retry <= maxRetries; retry++) {
            const proxy = this.getNextProxy();
            const tempClient = axios.create({
                baseURL: 'https://api.blockstreet.money/api',
                httpsAgent: proxy ? new HttpsProxyAgent(proxy) : null,
                timeout: 30000,
                headers: {
                    accept: 'application/json, text/plain, */*',
                    'accept-language': 'en-US,en;q=0.9',
                    'sec-ch-ua': '"Brave";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-site',
                    'sec-gpc': '1',
                    Referer: 'https://blockstreet.money/',
                    Origin: SAMPLE_HEADERS.origin
                }
            });

            const nonce = Math.random().toString(36).substring(7);
            const issuedAt = new Date().toISOString();
            const expiresAt = new Date(Date.now() + 120000).toISOString();
            const message = `blockstreet.money wants you to sign in with your Ethereum account:\n${this.wallet.address}\n\nWelcome to Block Street\n\nURI: https://blockstreet.money\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${expiresAt}`;

            logger.loading(`Signing for ${this.wallet.address}...`);
            const signature = await this.wallet.signMessage(message);

            const loginData = new URLSearchParams({
                address: this.wallet.address,
                nonce,
                signature,
                chainId: '1',
                issuedAt,
                expirationTime: expiresAt,
                invite_code: process.env.INVITE_CODE || 'Eu8K2T'
            }).toString();

            const loginConfig = {
                method: 'POST',
                url: '/account/signverify',
                headers: { 
                    'content-type': 'application/x-www-form-urlencoded',
                    'User-Agent': generateRandomUA(),  // Random UA
                    timestamp: SAMPLE_HEADERS.timestamp || Date.now().toString(),
                    signature: signature,
                    fingerprint: SAMPLE_HEADERS.fingerprint,
                    abs: SAMPLE_HEADERS.abs,
                    token: SAMPLE_HEADERS.token,
                    origin: SAMPLE_HEADERS.origin
                },
                data: loginData,
                validateStatus: () => true
            };

            try {
                const res = await tempClient.request(loginConfig);

                // Update session
                const setCookie = res.headers['set-cookie'];
                if (setCookie) {
                    let sessionCookie = null;
                    if (Array.isArray(setCookie)) {
                        sessionCookie = setCookie.find(c => c.startsWith('gfsessionid='));
                    } else if (setCookie.startsWith('gfsessionid=')) {
                        sessionCookie = setCookie;
                    }
                    if (sessionCookie) this.sessionId = sessionCookie.split(';')[0];
                }

                // Proxy error check
                const isProxyError = res.status === 492 || (res.data && typeof res.data === 'string' && res.data.includes('The requested URL could not be retrieved'));
                if (isProxyError) {
                    logger.warn(`Proxy error in login (retry ${retry + 1}/${maxRetries})`);
                    if (retry < maxRetries) {
                        await randomDelay(5000, 10000);
                        continue;
                    }
                    // Fallback login without proxy
                    return this.loginWithoutProxy(captchaToken);
                }

                if (res.data && (res.data.code === 0 || res.status === 200)) {
                    logger.success('Login successful.');
                    return res.data.data || res.data;
                } else {
                    const errMsg = res.data?.message || JSON.stringify(res.data) || `${res.status}`;
                    throw new Error(`Login failed: ${errMsg}`);
                }
            } catch (err) {
                logger.warn(`Login error (retry ${retry + 1}/${maxRetries}): ${err.message}`);
                if (retry < maxRetries) {
                    await randomDelay(5000, 10000);
                    continue;
                }
                throw err;
            }
        }
    }

    // Fallback login without proxy
    async loginWithoutProxy(captchaToken) {
        const noProxyClient = axios.create({
            baseURL: 'https://api.blockstreet.money/api',
            httpsAgent: null,
            timeout: 30000,
            headers: {
                // Same as above but no proxy
                accept: 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                'sec-ch-ua': '"Brave";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site',
                'sec-gpc': '1',
                Referer: 'https://blockstreet.money/',
                Origin: SAMPLE_HEADERS.origin
            }
        });

        // Same login logic as above, but with noProxyClient
        const nonce = Math.random().toString(36).substring(7);
        const issuedAt = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 120000).toISOString();
        const message = `blockstreet.money wants you to sign in with your Ethereum account:\n${this.wallet.address}\n\nWelcome to Block Street\n\nURI: https://blockstreet.money\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${expiresAt}`;

        const signature = await this.wallet.signMessage(message);

        const loginData = new URLSearchParams({
            address: this.wallet.address,
            nonce,
            signature,
            chainId: '1',
            issuedAt,
            expirationTime: expiresAt,
            invite_code: process.env.INVITE_CODE || 'Eu8K2T'
        }).toString();

        const loginConfig = {
            method: 'POST',
            url: '/account/signverify',
            headers: { 
                'content-type': 'application/x-www-form-urlencoded',
                'User-Agent': generateRandomUA(),
                timestamp: SAMPLE_HEADERS.timestamp || Date.now().toString(),
                signature: signature,
                fingerprint: SAMPLE_HEADERS.fingerprint,
                abs: SAMPLE_HEADERS.abs,
                token: SAMPLE_HEADERS.token,
                origin: SAMPLE_HEADERS.origin
            },
            data: loginData,
            validateStatus: () => true
        };

        try {
            const res = await noProxyClient.request(loginConfig);
            // Update session (same)
            const setCookie = res.headers['set-cookie'];
            if (setCookie) {
                let sessionCookie = null;
                if (Array.isArray(setCookie)) {
                    sessionCookie = setCookie.find(c => c.startsWith('gfsessionid='));
                } else if (setCookie.startsWith('gfsessionid=')) {
                    sessionCookie = setCookie;
                }
                if (sessionCookie) this.sessionId = sessionCookie.split(';')[0];
            }

            if (res.data && (res.data.code === 0 || res.status === 200)) {
                logger.success('Login successful (no proxy fallback).');
                return res.data.data || res.data;
            } else {
                throw new Error(`No-proxy login failed: ${res.data?.message || JSON.stringify(res.data)}`);
            }
        } catch (err) {
            throw new Error(`No-proxy login error: ${err.message}`);
        }
    }

    // API methods (with request that has retry)
    getTokens() { return this.request({ method: 'GET', url: '/swap/token_list' }, false); }
    dailyShare() { return this.request({ method: 'POST', url: '/share' }); }
    getEarnBalance() { return this.request({ method: 'GET', url: '/earn/info' }); }
    getSupplies() { return this.request({ method: 'GET', url: '/my/supply' }); }

    swap(fromSymbol, toSymbol, fromAmount, toAmount) {
        return this.request({
            method: 'POST',
            url: '/swap',
            data: { from_symbol: fromSymbol, to_symbol: toSymbol, from_amount: fromAmount.toString(), to_amount: toAmount.toString() },
            headers: { 'content-type': 'application/json' }
        });
    }

    supply(symbol, amount) {
        return this.request({ method: 'POST', url: '/supply', data: { symbol, amount: amount.toString() }, headers: { 'content-type': 'application/json' } });
    }

    withdraw(symbol, amount) {
        return this.request({ method: 'POST', url: '/withdraw', data: { symbol, amount: amount.toString() }, headers: { 'content-type': 'application/json' } });
    }

    borrow(symbol, amount) {
        return this.request({ method: 'POST', url: '/borrow', data: { symbol, amount: amount.toString() }, headers: { 'content-type': 'application/json' } });
    }

    repay(symbol, amount) {
        return this.request({ method: 'POST', url: '/repay', data: { symbol, amount: amount.toString() }, headers: { 'content-type': 'application/json' } });
    }
}

// Execute action (pass proxies to client)
const executeAction = async (wallets, proxies, actionFunc, numCycles, captchaToken) => {
    for (const wallet of wallets) {
        const client = new BlockStreetClient(wallet, proxies[0] || null, proxies);  // Pass list for rotation
        logger.info(`Processing ${wallet.address}`);
        try {
            await client.login(captchaToken);
            for (let i = 0; i < numCycles; i++) {
                logger.info(`Cycle ${i + 1}/${numCycles}`);
                await actionFunc(client);
                await randomDelay();
            }
            logger.success(`Completed for ${wallet.address}`);
        } catch (err) {
            logger.error(`Error for ${wallet.address}: ${err.message}`);
        }
        await randomDelay(2000, 5000);
    }
};

// Daily full run (swap with try-catch for skip on fail)
const dailyFullRun = async (wallets, proxies, tokens, numCycles, captchaToken) => {
    for (const [idx, wallet] of wallets.entries()) {
        const client = new BlockStreetClient(wallet, proxies[0] || null, proxies);
        logger.info(`Wallet ${idx + 1}/${wallets.length}: ${wallet.address}`);
        try {
            await client.login(captchaToken);
            await client.dailyShare();
            logger.success('Daily share done.');

            let supplies = [];
            let earn = {};
            try {
                supplies = await client.getSupplies() || [];
                earn = await client.getEarnBalance() || {};
            } catch (e) {
                logger.warn(`Balance fetch failed: ${e.message}`);
            }
            if (earn.balance) logger.info(`Earn: ${parseFloat(earn.balance).toFixed(4)}`);

            if (supplies.length) {
                logger.info('Supplies:');
                supplies.forEach(s => {
                    if (parseFloat(s.amount) > 0) logger.info(`  ${s.symbol}: ${parseFloat(s.amount).toFixed(4)}`);
                });
            }

            for (let cycle = 0; cycle < numCycles; cycle++) {
                logger.info(`Cycle ${cycle + 1}/${numCycles}`);

                // Swaps with skip on fail
                const owned = supplies.filter(s => parseFloat(s.amount) > 0);
                if (owned.length) {
                    let swapCount = 0;
                    while (swapCount < 5) {
                        try {
                            const fromAsset = owned[Math.floor(Math.random() * owned.length)];
                            const fromToken = tokens.find(t => t.symbol === fromAsset.symbol);
                            if (!fromToken) break;
                            let toToken;
                            do { toToken = tokens[Math.floor(Math.random() * tokens.length)]; }
                            while (toToken && toToken.symbol === fromToken.symbol);
                            if (!toToken) break;
                            const amt = getRandomAmount(0.001, 0.0015);
                            const toAmt = (amt * parseFloat(fromToken.price || 1)) / parseFloat(toToken.price || 1);
                            await client.swap(fromToken.symbol, toToken.symbol, amt, toAmt);
                            logger.success(`Swap ${swapCount + 1}: ${amt.toFixed(5)} ${fromToken.symbol} -> ${toAmt.toFixed(5)} ${toToken.symbol}`);
                            swapCount++;
                        } catch (e) { 
                            logger.error(`Swap ${swapCount + 1} failed (skipping): ${e.message}`); 
                            // Retry logic in request handles proxy fail; here just skip if business error
                        }
                        await randomDelay();
                    }
                } else {
                    logger.warn('No supplies for swaps. Skipping.');
                }

                // Actions
                const actions = [
                    { fn: 'supply', name: 'Supply', times: 2 },
                    { fn: 'withdraw', name: 'Withdraw', times: 2 },
                    { fn: 'borrow', name: 'Borrow', times: 2 },
                    { fn: 'repay', name: 'Repay', times: 1 }
                ];

                for (const act of actions) {
                    for (let t = 0; t < act.times; t++) {
                        try {
                            const token = tokens[Math.floor(Math.random() * tokens.length)];
                            const amt = getRandomAmount(0.001, 0.0015);
                            await client[act.fn](token.symbol, amt);
                            logger.success(`${act.name} ${t+1}: ${amt.toFixed(5)} ${token.symbol}`);
                        } catch (e) { logger.error(`${act.name} ${t+1} failed (skipping): ${e.message}`); }
                        await randomDelay();
                    }
                }
                supplies = await client.getSupplies() || [];
            }
            logger.success(`Wallet ${wallet.address} cycles complete.`);
        } catch (err) {
            logger.error(`Wallet ${wallet.address} failed: ${err.message}`);
        }
        await randomDelay(4000, 8000);
    }
};

// Continuous run (unchanged)
const runDaily = async (wallets, proxies, tokens, numCycles, captchaToken) => {
    while (true) {
        await dailyFullRun(wallets, proxies, tokens, numCycles, captchaToken);
        logger.success('Full daily run complete.');
        let remaining = 24 * 3600;
        while (remaining > 0) {
            const h = Math.floor(remaining / 3600).toString().padStart(2, '0');
            const m = Math.floor((remaining % 3600) / 60).toString().padStart(2, '0');
            const s = (remaining % 60).toString().padStart(2, '0');
            process.stdout.write(`${colors.cyan}[⏳] Next run in: ${h}:${m}:${s} ...${colors.reset}\r`);
            remaining--;
            await new Promise(r => setTimeout(r, 1000));
        }
        console.log('\n');
    }
};

// Token select
const selectToken = async (tokens, prompt) => {
    console.log(`${colors.cyan}${prompt}${colors.reset}`);
    tokens.forEach((t, i) => console.log(`${i + 1}. ${t.symbol}`));
    const idx = parseInt(await ask('> '), 10) - 1;
    return idx >= 0 && idx < tokens.length ? tokens[idx] : null;
};

// Utility
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomAmount = (min, max) => Math.random() * (max - min) + min;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (query) => new Promise(resolve => rl.question(query, resolve));
const close = () => rl.close();

// Main (pass proxies to client)
async function main() {
    logger.banner();
    const proxies = readProxies('proxies.txt');
    if (proxies.length) logger.info(`Loaded ${proxies.length} proxies.`);

    const privateKeyEnvKeys = Object.keys(process.env).filter(k => k.startsWith('PRIVATE_KEY_'));
    logger.info(`Found PRIVATE_KEY_ env vars: ${privateKeyEnvKeys.join(', ') || 'none'}`);

    let wallets = [];
    if (privateKeyEnvKeys.length === 0) {
        logger.error('No PRIVATE_KEY_ vars in .env.');
        close();
        return;
    }

    for (const key of privateKeyEnvKeys) {
        const privateKey = process.env[key];
        if (!privateKey || privateKey.trim() === '') {
            logger.warn(`Empty key for ${key}. Skipping.`);
            continue;
        }
        try {
            const wallet = new ethers.Wallet(privateKey.trim());
            wallets.push(wallet);
            logger.success(`Loaded wallet ${key}: ${wallet.address}`);
        } catch (error) {
            logger.error(`Failed to load wallet from ${key}: ${error.message}`);
        }
    }

    if (wallets.length === 0) {
        logger.error('No valid wallets loaded.');
        close();
        return;
    }
    logger.success(`Successfully loaded ${wallets.length} wallet(s).`);

    while (true) {
        console.log(`${colors.cyan}${colors.bold}--- SELECT ACTION ---${colors.reset}`);
        const choice = await ask('1. Swap\n2. Supply\n3. Withdraw\n4. Borrow\n5. Repay\n6. Daily Full Run\n7. Exit\n> ');

        if (choice === '7') {
            logger.info('Exiting.');
            close();
            return;
        }

        if (!['1','2','3','4','5','6'].includes(choice)) {
            logger.error('Invalid choice.');
            continue;
        }

        const cyclesStr = await ask('Transaction cycles per wallet? ');
        const cycles = parseInt(cyclesStr, 10);
        if (isNaN(cycles) || cycles < 1) {
            logger.error('Invalid cycles.');
            continue;
        }

        let captchaToken;
        try {
            captchaToken = await solveCaptcha('0x4AAAAAABpfyUqunlqwRBYN', 'https://blockstreet.money/dashboard');
        } catch (err) {
            logger.error(`CAPTCHA failed: ${err.message}`);
            continue;
        }

        let tokens = [];
        let testClient;
        try {
            testClient = new BlockStreetClient(wallets[0], proxies[0] || null, proxies);
            await testClient.login(captchaToken);
            await testClient.dailyShare();
            logger.success('Daily share done in setup.');
            tokens = await testClient.getTokens();
            logger.success(`Setup complete. ${tokens.length} tokens loaded.`);
        } catch (err) {
            logger.error(`Setup failed: ${err.message}`);
            continue;
        }

        if (choice === '6') {
            logger.info(`Starting daily run with ${cycles} cycles.`);
            runDaily(wallets, proxies, tokens, cycles, captchaToken);
            continue;
        }

        let actionFunc;
        if (choice === '1') {
            const fromT = await selectToken(tokens, 'Swap FROM:');
            if (!fromT) continue;
            const toT = await selectToken(tokens, 'Swap TO:');
            if (!toT || fromT.symbol === toT.symbol) continue;
            const amtStr = await ask(`Amount for ${fromT.symbol}: `);
            const amt = parseFloat(amtStr);
            if (isNaN(amt) || amt <= 0) continue;
            actionFunc = async (client) => {
                const toAmt = (amt * parseFloat(fromT.price || 1)) / parseFloat(toT.price || 1);
                await client.swap(fromT.symbol, toT.symbol, amt, toAmt);
                logger.success(`Swapped ${amt.toFixed(5)} ${fromT.symbol} -> ${toAmt.toFixed(5)} ${toT.symbol}`);
            };
        } else {
            const actionMap = { '2': { name: 'Supply', fn: 'supply' }, '3': { name: 'Withdraw', fn: 'withdraw' }, '4': { name: 'Borrow', fn: 'borrow' }, '5': { name: 'Repay', fn: 'repay' } };
            const act = actionMap[choice];
            const token = await selectToken(tokens, `${act.name} token:`);
            if (!token) continue;
            const amtStr = await ask(`Amount for ${token.symbol}: `);
            const amt = parseFloat(amtStr);
            if (isNaN(amt) || amt <= 0) continue;
            actionFunc = async (client) => {
                await client[act.fn](token.symbol, amt);
                logger.success(`${act.name}ed ${amt.toFixed(5)} ${token.symbol}`);
            };
        }

        await executeAction(wallets, proxies, actionFunc, cycles, captchaToken);
        logger.success('Actions complete. Back to menu.');
    }
}

main().catch(err => {
    logger.error(`Fatal error: ${err.message}`);
    close();
});
