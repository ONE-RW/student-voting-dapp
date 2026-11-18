const CONTRACT_ADDRESS = "0x92Ae3C775d794a819bFf8Cfcf1FA76ea5131F63d";
const EXPECTED_CHAIN_ID = 11155111n;
const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";
const ABI_PATH = "./Voting.json";

const connectWalletButton = document.getElementById("connectWalletButton");
const refreshButton = document.getElementById("refreshButton");
const copyAddressButton = document.getElementById("copyAddressButton");
const walletStatus = document.getElementById("walletStatus");
const networkStatus = document.getElementById("networkStatus");
const connectionLabel = document.getElementById("connectionLabel");
const voterStatus = document.getElementById("voterStatus");
const candidateList = document.getElementById("candidateList");
const results = document.getElementById("results");
const message = document.getElementById("message");
const transactionStatus = document.getElementById("transactionStatus");
const registrationBadge = document.getElementById("registrationBadge");
const statusAddress = document.getElementById("statusAddress");
const statusHint = document.getElementById("statusHint");
const totalVotes = document.getElementById("totalVotes");
const activityAlert = document.getElementById("activityAlert");
const activityTitle = document.getElementById("activityTitle");
const activityDetail = document.getElementById("activityDetail");
const activityIcon = document.getElementById("activityIcon");
const activitySpinner = document.getElementById("activitySpinner");
const voterHistory = document.getElementById("voterHistory");
const refreshVoterHistoryButton = document.getElementById("refreshVoterHistoryButton");

let provider;
let contract;
let account;

function showMessage(text, error = false) {
  message.textContent = text;
  message.classList.toggle("error", error);
}

function showActivity(title, detail, state = "info") {
  activityAlert.hidden = false;
  activityAlert.classList.remove("is-busy", "is-error", "is-success");
  if (state === "busy") activityAlert.classList.add("is-busy");
  if (state === "error") activityAlert.classList.add("is-error");
  if (state === "success") activityAlert.classList.add("is-success");
  activityTitle.textContent = title;
  activityDetail.textContent = detail;
  activityIcon.textContent = state === "error" ? "!" : state === "success" ? "✓" : "i";
  activitySpinner.hidden = state !== "busy";
}

function errorText(error) {
  return error?.shortMessage || error?.reason || error?.message || "Something went wrong.";
}

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function loadAbi() {
  const response = await fetch(ABI_PATH);
  if (!response.ok) throw new Error("Could not load the voting contract ABI.");
  const artifact = await response.json();
  return Array.isArray(artifact) ? artifact : artifact.abi;
}

async function switchToSepolia() {
  const currentChainId = await window.ethereum.request({ method: "eth_chainId" });
  if (BigInt(currentChainId) === EXPECTED_CHAIN_ID) return;
  await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }] });
}

function setStepState(id, state, detail) {
  const step = document.getElementById(id);
  step.classList.remove("active", "complete");
  if (state) step.classList.add(state);
  if (detail) step.querySelector("small").textContent = detail;
}

async function connectWallet() {
  try {
    if (!window.ethereum) throw new Error("MetaMask was not detected. Install or enable the extension, then reload.");
    if (typeof ethers === "undefined") throw new Error("Ethers.js did not load. Check your internet connection and reload.");
    connectWalletButton.disabled = true;
    showActivity("Wallet connection requested", "Approve the connection request in MetaMask to continue.", "busy");
    showMessage("Waiting for MetaMask wallet approval...");
    await window.ethereum.request({ method: "eth_requestAccounts" });
    showActivity("Checking network", "Switching to the Sepolia test network if needed.", "busy");
    await switchToSepolia();
    provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    account = await signer.getAddress();
    showActivity("Loading your voting profile", "Checking the contract and your voter registration.", "busy");
    const network = await provider.getNetwork();
    if (network.chainId !== EXPECTED_CHAIN_ID) throw new Error("Sepolia is required. Switch MetaMask to Sepolia, then connect again.");
    const code = await provider.getCode(CONTRACT_ADDRESS);
    if (code === "0x") throw new Error("The voting contract was not found on Sepolia.");

    contract = new ethers.Contract(CONTRACT_ADDRESS, await loadAbi(), signer);
    walletStatus.textContent = shortAddress(account);
    networkStatus.textContent = "Network: Sepolia test network";
    connectionLabel.textContent = "Connected";
    document.querySelector(".wallet-card").classList.add("connected");
    connectWalletButton.textContent = "Connected";
    copyAddressButton.hidden = false;
    copyAddressButton.onclick = async () => {
      try {
        await navigator.clipboard.writeText(account);
        showMessage("Wallet address copied.");
      } catch (_) {
        showMessage("Could not copy the address. Select it in MetaMask instead.", true);
      }
    };
    await refresh();
    await loadVoterHistory();
    showActivity("Wallet connected", "Your wallet and Sepolia network are ready.", "success");
    showMessage("Wallet and voting contract connected.");
  } catch (error) {
    console.error(error);
    showActivity("Could not connect wallet", errorText(error), "error");
    showMessage(errorText(error), true);
    transactionStatus.textContent = errorText(error);
  } finally {
    connectWalletButton.disabled = false;
  }
}

async function refresh() {
  if (!contract) {
    showMessage("Connect your wallet before refreshing the ballot.", true);
    return;
  }
  try {
    showActivity("Checking voter status", "Reading the latest ballot and vote totals from Sepolia.", "busy");
    const [[ids, names, voteCounts], voter] = await Promise.all([contract.getCandidates(), contract.voters(account)]);
    candidateList.replaceChildren();
    results.replaceChildren();
    statusAddress.textContent = `${shortAddress(account)} (you)`;
    voterStatus.textContent = voter[1] ? "You have already voted." : voter[0] ? "You are registered and can vote." : "Your wallet is not registered.";
    registrationBadge.textContent = voter[1] ? "Vote submitted" : voter[0] ? "Registered" : "Not registered";
    registrationBadge.classList.toggle("success", voter[0]);
    statusHint.textContent = voter[1] ? "Your vote has been recorded on the Sepolia network." : voter[0] ? "You can cast one vote for a candidate." : "Ask the administrator to register this wallet address.";
    setStepState("stepConnect", "complete", "Connected");
    setStepState("stepRegister", voter[0] ? "complete" : "active", voter[0] ? "Wallet registered" : "Send your address to the administrator");
    setStepState("stepVote", voter[0] && !voter[1] ? "active" : voter[1] ? "complete" : "", voter[1] ? "Vote recorded" : "One vote per voter");

    if (ids.length === 0) {
      candidateList.innerHTML = '<div class="empty-state">No candidates have been added yet.</div>';
      results.innerHTML = '<div class="empty-state">No results yet.</div>';
      totalVotes.textContent = "Total votes: 0";
      showActivity(voter[0] ? "You are registered" : "Registration needed", voter[0] ? "The ballot will appear when candidates are added." : "Send your wallet address to the administrator to be registered.", voter[0] ? "success" : "info");
      showMessage(voter[0] ? "You are registered. The ballot is not available yet." : "Your wallet is not registered to vote.", !voter[0]);
      return;
    }

    const total = voteCounts.reduce((sum, count) => sum + BigInt(count), 0n);
    totalVotes.textContent = `Total votes: ${total}`;
    ids.forEach((id, index) => {
      const count = BigInt(voteCounts[index]);
      const percentage = total === 0n ? 0 : Number((count * 10000n) / total) / 100;
      const initials = names[index].trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
      const card = document.createElement("article");
      card.className = "candidate";
      const info = document.createElement("div");
      info.className = "candidate-info";
      const avatar = document.createElement("span");
      avatar.className = "candidate-avatar";
      avatar.textContent = initials || "?";
      const text = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = names[index];
      const detail = document.createElement("p");
      detail.textContent = `Candidate #${id} | ${count} vote(s)`;
      text.append(title, detail);
      info.append(avatar, text);
      const voteButton = document.createElement("button");
      voteButton.type = "button";
      voteButton.className = "vote-button";
      voteButton.textContent = voter[1] ? "Voted" : voter[0] ? "Vote" : "Not registered";
      voteButton.disabled = !voter[0] || voter[1];
      voteButton.addEventListener("click", () => submitVote(id, names[index]));
      card.append(info, voteButton);
      candidateList.append(card);

      const result = document.createElement("div");
      result.className = "result-item";
      const line = document.createElement("div");
      line.className = "result-line";
      const resultName = document.createElement("strong");
      resultName.textContent = names[index];
      const resultCount = document.createElement("span");
      resultCount.className = "result-count";
      resultCount.textContent = `${count} vote(s) | ${percentage}%`;
      line.append(resultName, resultCount);
      const track = document.createElement("div");
      track.className = "result-track";
      const fill = document.createElement("div");
      fill.className = "result-fill";
      fill.style.width = `${percentage}%`;
      track.append(fill);
      result.append(line, track);
      results.append(result);
    });
    showActivity(voter[1] ? "Vote already recorded" : voter[0] ? "You are ready to vote" : "Registration needed", voter[1] ? "Your vote is on the Sepolia network. Thank you for participating." : voter[0] ? "Choose a candidate, then confirm the transaction in MetaMask." : "Send your wallet address to the administrator to be registered.", voter[1] || voter[0] ? "success" : "info");
    showMessage(voter[1] ? "Your vote has already been recorded." : voter[0] ? "You are registered and ready to vote." : "This wallet is not registered. Ask the administrator to register it.", !voter[0]);
  } catch (error) {
    showActivity("Could not load voting data", errorText(error), "error");
    showMessage(`Could not read voting data: ${errorText(error)}`, true);
  }
}

async function submitVote(candidateId, candidateName) {
  try {
    showActivity("Vote awaiting your approval", `Review and confirm your vote for ${candidateName} in MetaMask.`, "busy");
    showMessage("Confirm the vote in MetaMask...");
    transactionStatus.textContent = `Waiting for your vote for ${candidateName} to be confirmed...`;
    const transaction = await contract.vote(candidateId);
    showActivity("Transaction submitted", "Your vote is being confirmed on Sepolia. Please keep this page open.", "busy");
    transactionStatus.textContent = `Vote transaction submitted: ${shortAddress(transaction.hash)}`;
    showMessage("Vote submitted. Waiting for confirmation...");
    await transaction.wait();
    transactionStatus.textContent = `Your vote for ${candidateName} was confirmed on Sepolia.`;
    await refresh();
    await loadVoterHistory();
    showActivity("Vote confirmed", `Your vote for ${candidateName} has been recorded successfully.`, "success");
    showMessage(`Your vote for ${candidateName} has been recorded.`);
  } catch (error) {
    console.error(error);
    showActivity("Vote not completed", errorText(error), "error");
    transactionStatus.textContent = errorText(error);
    showMessage(errorText(error), true);
  }
}

async function loadVoterHistory() {
  if (!contract || !account) {
    voterHistory.innerHTML = '<p class="history-empty">Connect your wallet to view its confirmed votes.</p>';
    return;
  }

  voterHistory.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "history-empty";
  loading.textContent = "Loading your confirmed vote history...";
  voterHistory.append(loading);

  try {
    let events;
    try {
      events = await contract.queryFilter(contract.filters.VoteCast(account, null), 0, "latest");
    } catch (rpcError) {
      console.warn("RPC could not scan this wallet's vote history; trying Sepolia explorer index:", rpcError);
      const indexedEvents = await loadIndexedVoterEvents();
      events = indexedEvents.filter((event) => {
        const voterAddress = event.args.voter ?? event.args[0];
        return voterAddress.toLowerCase() === account.toLowerCase();
      });
    }
    const orderedEvents = [...events].sort((a, b) => b.blockNumber - a.blockNumber || (b.index ?? 0) - (a.index ?? 0));
    voterHistory.replaceChildren();
    if (!orderedEvents.length) {
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = "No confirmed votes found for this wallet.";
      voterHistory.append(empty);
      return;
    }

    for (const event of orderedEvents) {
      const candidateId = event.args.candidateId ?? event.args[1];
      let candidateName = `Candidate #${candidateId}`;
      try {
        const candidate = await contract.getCandidate(candidateId);
        candidateName = candidate.name ?? candidate[1];
      } catch (_) {
        // Keep the candidate ID visible if a candidate read is unavailable.
      }

      const row = document.createElement("article");
      row.className = "voter-history-entry";
      const details = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = `Voted for ${candidateName}`;
      const meta = document.createElement("small");
      meta.textContent = `Confirmed in block ${event.blockNumber}`;
      details.append(title, meta);
      const link = document.createElement("a");
      link.href = `https://sepolia.etherscan.io/tx/${event.transactionHash}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "View tx";
      link.setAttribute("aria-label", `View vote for ${candidateName} on Sepolia Etherscan`);
      row.append(details, link);
      voterHistory.append(row);
    }
  } catch (error) {
    console.error("Could not load voter history:", error);
    voterHistory.replaceChildren();
    const unavailable = document.createElement("p");
    unavailable.className = "history-empty history-error";
    unavailable.textContent = "Could not load vote history from the Sepolia provider. Refresh or open the transaction list on Sepolia Etherscan.";
    voterHistory.append(unavailable);
  }
}

async function loadIndexedVoterEvents() {
  const baseUrl = `https://eth-sepolia.blockscout.com/api/v2/addresses/${CONTRACT_ADDRESS}/logs`;
  const events = [];
  let nextUrl = baseUrl;
  while (nextUrl) {
    const response = await fetch(nextUrl);
    if (!response.ok) throw new Error(`Sepolia explorer returned HTTP ${response.status} while loading vote history.`);
    const page = await response.json();
    for (const log of page.items || []) {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
        if (!parsed || parsed.name !== "VoteCast") continue;
        const voterAddress = parsed.args.voter ?? parsed.args[0];
        if (voterAddress.toLowerCase() !== account.toLowerCase()) continue;
        events.push({
          args: parsed.args,
          blockNumber: Number(log.block_number),
          index: Number(log.index),
          transactionHash: log.transaction_hash,
        });
      } catch (_) {
        // Ignore logs that do not match this contract ABI.
      }
    }
    if (events.length) break;
    const cursor = page.next_page_params;
    nextUrl = cursor && Object.keys(cursor).length
      ? `${baseUrl}?${new URLSearchParams(cursor).toString()}`
      : null;
  }
  return events;
}

connectWalletButton.addEventListener("click", connectWallet);
refreshButton.addEventListener("click", refresh);
refreshVoterHistoryButton.addEventListener("click", loadVoterHistory);

if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => window.location.reload());
  window.ethereum.on("chainChanged", () => window.location.reload());
}
