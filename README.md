# Student Voting dApp

## Run the app

Requirements: Python, a browser with MetaMask, and an internet connection so the page can
load ethers.js from jsDelivr.

In VS Code's terminal, from the project root, start the static server:

```powershell
py -m http.server 8000
```

Open <http://localhost:8000/frontend/>. The page uses the ABI in `frontend/Voting.json`
and starts with the supplied contract address. Set MetaMask to the network where that
contract was deployed, then click **Connect Wallet** and approve the connection. The page
shows the active network and chain ID after it connects.

The administrator uses `frontend/index.html`. Share `frontend/vote.html` with students:
it only allows a registered wallet to vote and contains no administrator controls. On GitHub
Pages, replace `frontend/vote.html` with your published site URL followed by `/vote.html`.

## Netlify deployment

`netlify.toml` publishes the `frontend` folder. After pushing it to the connected GitHub
repository, Netlify serves the administrator page at the site root and the voter portal at
`/vote.html`.

The deploying account is the administrator and can add candidates and register voter
addresses. Registered wallets can vote once. Candidate names and vote totals are read from
the contract. The administrator page also reads voter and transaction history from the
contract's on-chain events. Use the deployment network's native token for transaction fees.

Netlify publishes the `frontend` directory, including its HTML, CSS, JavaScript, and ABI files.
Connect the Netlify site to this repository's `main` branch and enable automatic deploys so
each pushed commit appears on the live site after its deploy succeeds. The voter page is at
`/vote.html`; the administrator page is the site root. If a deploy succeeds but the browser
still shows an older version, clear the site's deploy cache and hard-refresh the page.

If the page says no contract was found at the address, verify the address and switch
MetaMask to the deployment network. If `Voting.json` cannot be loaded, check that the ABI file exists
in the `frontend` folder and that you opened the page through the local server rather than
opening `index.html` directly.

## Remix deployment

Compile `contracts/Voting.sol` in Remix, connect Remix to MetaMask on your chosen network,
and deploy the contract. Use Remix's deployed address in the address field on the page. The ABI file
in the frontend must correspond to the compiled contract. Never share a wallet recovery
phrase or private key.
