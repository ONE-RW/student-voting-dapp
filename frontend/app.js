const EXPECTED_CHAIN_ID = 11155111n;
const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";
const ABI_PATHS = ["./Voting.json", "../Voting.json"];

const connectWalletButton = document.getElementById("connectWalletButton");
const walletStatus = document.getElementById("walletStatus");
const networkStatus = document.getElementById("networkStatus");
const message = document.getElementById("message");
const contractAddressInput = document.getElementById("contractAddress");
const candidateList = document.getElementById("candidateList");
const results = document.getElementById("results");
const adminPanel = document.getElementById("adminPanel");
const candidateForm = document.getElementById("candidateForm");
const registerForm = document.getElementById("registerForm");
const transactionHistoryPanel = document.getElementById("transactionHistoryPanel");
const transactionHistory = document.getElementById("transactionHistory");
const refreshHistoryButton = document.getElementById("refreshHistoryButton");

let provider;
let signer;
let contract;
let account;
let isAdmin = false;

function showMessage(text, error = false) {
  message.textContent = text;
  message.classList.toggle("error", error);
}

function errorText(error) {
  return error?.shortMessage || error?.reason || error?.message || "Something went wrong.";
}

async function loadAbi() {
  for (const path of ABI_PATHS) {
    try {
      const response = await fetch(path);
      if (!response.ok) continue;
      const artifact = await response.json();
      if (Array.isArray(artifact)) return artifact;
      if (Array.isArray(artifact.abi)) return artifact.abi;
    } catch (_) {
      // Try the other supported server location.
    }
  }
  throw new Error("Could not load Voting.json. Keep the ABI file in the frontend folder or serve the project root.");
}

async function switchToSepolia() {
  const currentChainId = await window.ethereum.request({ method: "eth_chainId" });
  if (BigInt(currentChainId) === EXPECTED_CHAIN_ID) return;

  await window.ethereum.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
  });
}

async function connectWallet() {
  try {
    if (!window.ethereum) throw new Error("MetaMask was not detected. Install or enable the extension, then reload.");
    if (typeof ethers === "undefined") throw new Error("Ethers.js did not load. Check your internet connection and reload.");

    await window.ethereum.request({ method: "eth_requestAccounts" });
    await switchToSepolia();
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    account = await signer.getAddress();

    const network = await provider.getNetwork();
    const networkName = network.name === "unknown" ? "Unknown" : network.name;
    networkStatus.textContent = `Connected network: ${networkName} (chain ID ${network.chainId})`;
    walletStatus.textContent = `Connected account: ${account}`;
    if (network.chainId !== EXPECTED_CHAIN_ID) {
      throw new Error("Sepolia is required for this voting contract. Switch MetaMask to Sepolia, then connect again.");
    }
    const address = contractAddressInput.value.trim();
    if (!ethers.isAddress(address)) throw new Error("The Voting contract address is not valid.");
    const code = await provider.getCode(address);
    if (code === "0x") throw new Error(`No contract was found at this address on the current network (chain ID ${network.chainId}). Switch MetaMask to the network where you deployed it, then connect again.`);

    contract = new ethers.Contract(address, await loadAbi(), signer);
    const administrator = await contract.administrator();
    isAdmin = administrator.toLowerCase() === account.toLowerCase();
    walletStatus.textContent += isAdmin ? " (administrator)" : "";
    adminPanel.hidden = !isAdmin;
    transactionHistoryPanel.hidden = !isAdmin;
    connectWalletButton.textContent = "Wallet Connected";
    await refresh();
    showMessage(isAdmin
      ? "Administrator wallet and voting contract connected."
      : "Connected wallet is not the contract administrator. Full election history is restricted to the deploying wallet.", !isAdmin);
  } catch (error) {
    console.error(error);
    showMessage(errorText(error), true);
  }
}

async function refresh() {
  if (!contract) return;
  try {
    const [[ids, names, voteCounts], voter] = await Promise.all([
      contract.getCandidates(),
      contract.voters(account),
    ]);
    candidateList.replaceChildren();
    results.replaceChildren();

    const votersByCandidate = isAdmin ? await loadCandidateVoters(ids) : new Map();
    const namesById = new Map(ids.map((id, index) => [id.toString(), names[index]]));
    if (isAdmin) await renderTransactionHistory(namesById);
    if (ids.length === 0) {
      candidateList.textContent = "No candidates have been added yet.";
      results.textContent = "No results yet.";
      return;
    }

    ids.forEach((id, index) => {
      const card = document.createElement("article");
      card.className = "candidate";
      const title = document.createElement("h3");
      title.textContent = names[index];
      const details = document.createElement("p");
      details.textContent = `Candidate ID: ${id}`;
      const voterList = document.createElement("div");
      voterList.className = "candidate-voter-list";
      const candidateVoters = votersByCandidate.get(id.toString()) || [];
      const voterHeading = document.createElement("strong");
      voterHeading.textContent = `Voters (${candidateVoters.length})`;
      voterList.append(voterHeading);
      if (votersByCandidate.scanError) {
        const unavailable = document.createElement("p");
        unavailable.textContent = "Voter history is unavailable from the RPC provider.";
        voterList.append(unavailable);
      } else if (candidateVoters.length) {
        const list = document.createElement("ul");
        candidateVoters.forEach((address) => {
          const item = document.createElement("li");
          const addressText = document.createElement("code");
          addressText.textContent = address;
          item.append(addressText);
          list.append(item);
        });
        voterList.append(list);
      } else {
        const empty = document.createElement("p");
        empty.textContent = "No votes yet.";
        voterList.append(empty);
      }
      card.append(title, details);
      if (isAdmin) card.append(voterList);
      candidateList.appendChild(card);

      const result = document.createElement("div");
      result.className = "result-item";
      result.textContent = `${names[index]}: ${voteCounts[index]} vote(s)`;
      results.appendChild(result);
    });
  } catch (error) {
    showMessage(`Could not read voting data: ${errorText(error)}`, true);
  }
}

async function renderTransactionHistory(candidateNames = new Map()) {
  if (!contract || !isAdmin) return;
  transactionHistory.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "history-empty";
  loading.textContent = "Loading on-chain activity...";
  transactionHistory.append(loading);

  try {
    let voteEvents;
    let registrationEvents;
    let candidateEvents;
    try {
      [voteEvents, registrationEvents, candidateEvents] = await Promise.all([
        contract.queryFilter(contract.filters.VoteCast(), 0, "latest"),
        contract.queryFilter(contract.filters.VoterRegistered(), 0, "latest"),
        contract.queryFilter(contract.filters.CandidateAdded(), 0, "latest"),
      ]);
    } catch (rpcError) {
      console.warn("RPC could not scan full event history; trying Sepolia explorer index:", rpcError);
      const indexedEvents = await loadIndexedContractEvents(["VoteCast", "VoterRegistered", "CandidateAdded"]);
      voteEvents = indexedEvents.filter((event) => event.eventName === "VoteCast");
      registrationEvents = indexedEvents.filter((event) => event.eventName === "VoterRegistered");
      candidateEvents = indexedEvents.filter((event) => event.eventName === "CandidateAdded");
    }
    const entries = [
      ...voteEvents.map((event) => ({ event, kind: "vote" })),
      ...registrationEvents.map((event) => ({ event, kind: "registration" })),
      ...candidateEvents.map((event) => ({ event, kind: "candidate" })),
    ].sort((a, b) => b.event.blockNumber - a.event.blockNumber || (b.event.index ?? 0) - (a.event.index ?? 0)).slice(0, 20);

    transactionHistory.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = "No transactions have been recorded yet.";
      transactionHistory.append(empty);
      return;
    }

    for (const { event, kind } of entries) {
      let title;
      let detail;
      if (kind === "vote") {
        const [voterAddress, candidateId] = event.args;
        title = "Vote cast";
        detail = `${voterAddress} voted for ${candidateNames.get(candidateId.toString()) || `Candidate #${candidateId}`}`;
      } else if (kind === "registration") {
        title = "Voter registered";
        detail = `${event.args.voter} was registered to vote`;
      } else {
        title = "Candidate added";
        detail = `${event.args.candidateName} joined the ballot`;
      }

      const row = document.createElement("article");
      row.className = `history-entry history-${kind}`;
      const copy = document.createElement("div");
      copy.className = "history-entry-copy";
      const heading = document.createElement("strong");
      heading.textContent = title;
      const description = document.createElement("p");
      description.textContent = detail;
      const meta = document.createElement("small");
      meta.textContent = `Block ${event.blockNumber}`;
      copy.append(heading, description, meta);
      const link = document.createElement("a");
      link.href = `https://sepolia.etherscan.io/tx/${event.transactionHash}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "View on Etherscan";
      link.setAttribute("aria-label", `View ${title.toLowerCase()} transaction on Sepolia Etherscan`);
      row.append(copy, link);
      transactionHistory.append(row);
    }
  } catch (error) {
    console.warn("Could not load transaction history:", error);
    transactionHistory.replaceChildren();
    const unavailable = document.createElement("p");
    unavailable.className = "history-empty history-error";
    unavailable.textContent = "Transaction history could not be loaded from the Sepolia RPC provider. Try refreshing later.";
    transactionHistory.append(unavailable);
  }
}

async function loadCandidateVoters(candidateIds) {
  const voterMap = new Map(candidateIds.map((id) => [id.toString(), []]));
  try {
    let events;
    try {
      events = await contract.queryFilter(contract.filters.VoteCast(), 0, "latest");
    } catch (rpcError) {
      console.warn("RPC could not scan vote events; trying Sepolia explorer index:", rpcError);
      events = (await loadIndexedContractEvents(["VoteCast"])).filter((event) => event.eventName === "VoteCast");
    }
    for (const event of events) {
      const [voterAddress, candidateId] = event.args;
      const list = voterMap.get(candidateId.toString());
      if (list) list.push(voterAddress);
    }
  } catch (error) {
    console.warn("Could not load vote history:", error);
    voterMap.scanError = true;
  }
  return voterMap;
}

async function loadIndexedContractEvents(eventNames) {
  const baseUrl = `https://eth-sepolia.blockscout.com/api/v2/addresses/${contract.target}/logs`;
  const events = [];
  let nextUrl = baseUrl;
  while (nextUrl) {
    const response = await fetch(nextUrl);
    if (!response.ok) throw new Error(`Sepolia explorer returned HTTP ${response.status} while loading event history.`);
    const page = await response.json();
    for (const log of page.items || []) {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
        if (!parsed || !eventNames.includes(parsed.name)) continue;
        events.push({
          eventName: parsed.name,
          args: parsed.args,
          blockNumber: Number(log.block_number),
          index: Number(log.index),
          transactionHash: log.transaction_hash,
        });
      } catch (_) {
        // Ignore logs that do not match this contract ABI.
      }
    }
    const cursor = page.next_page_params;
    nextUrl = cursor && Object.keys(cursor).length
      ? `${baseUrl}?${new URLSearchParams(cursor).toString()}`
      : null;
  }
  return events;
}

async function submitTransaction(send, successText) {
  try {
    showMessage("Confirm the transaction in MetaMask...");
    const transaction = await send();
    showMessage("Transaction submitted. Waiting for confirmation...");
    await transaction.wait();
    await refresh();
    showMessage(successText);
  } catch (error) {
    console.error(error);
    showMessage(errorText(error), true);
  }
}

candidateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!contract || !isAdmin) return showMessage("Connect the administrator wallet first.", true);
  const name = new FormData(candidateForm).get("name").trim();
  if (!name) return;
  await submitTransaction(() => contract.addCandidate(name), `Added candidate: ${name}.`);
  candidateForm.reset();
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!contract || !isAdmin) return showMessage("Only the administrator can register voters.", true);
  const address = new FormData(registerForm).get("address").trim();
  if (!ethers.isAddress(address)) return showMessage("Enter a valid voter wallet address.", true);
  await submitTransaction(() => contract.registerVoter(address), `Registered voter ${address}.`);
  registerForm.reset();
});

connectWalletButton.addEventListener("click", connectWallet);
refreshHistoryButton.addEventListener("click", () => renderTransactionHistory());

if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => window.location.reload());
  window.ethereum.on("chainChanged", () => window.location.reload());
}
