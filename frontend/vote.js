const CONTRACT_ADDRESS = "0x92Ae3C775d794a819bFf8Cfcf1FA76ea5131F63d";
const EXPECTED_CHAIN_ID = 11155111n;
const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";
const ABI_PATH = "./Voting.json";

const connectWalletButton = document.getElementById("connectWalletButton");
const walletStatus = document.getElementById("walletStatus");
const networkStatus = document.getElementById("networkStatus");
const candidateList = document.getElementById("candidateList");
const results = document.getElementById("results");
const message = document.getElementById("message");

let provider;
let signer;
let contract;
let account;

function showMessage(text, error = false) {
  message.textContent = text;
  message.classList.toggle("error", error);
}

function errorText(error) {
  return error?.shortMessage || error?.reason || error?.message || "Something went wrong.";
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

  await window.ethereum.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
  });
}

async function connectWallet() {
  try {
    if (!window.ethereum) throw new Error("MetaMask was not detected. Install or enable it, then reload.");
    if (typeof ethers === "undefined") throw new Error("Ethers.js did not load. Check your internet connection and reload.");

    await window.ethereum.request({ method: "eth_requestAccounts" });
    await switchToSepolia();
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    account = await signer.getAddress();

    const network = await provider.getNetwork();
    if (network.chainId !== EXPECTED_CHAIN_ID) {
      throw new Error("Sepolia is required for this voting portal. Switch MetaMask to Sepolia, then connect again.");
    }

    const code = await provider.getCode(CONTRACT_ADDRESS);
    if (code === "0x") throw new Error("The voting contract was not found on Sepolia.");

    networkStatus.textContent = "Connected network: Sepolia (chain ID 11155111)";
    walletStatus.textContent = `Connected account: ${account}`;
    contract = new ethers.Contract(CONTRACT_ADDRESS, await loadAbi(), signer);
    connectWalletButton.textContent = "Wallet Connected";
    await refresh();
  } catch (error) {
    console.error(error);
    showMessage(errorText(error), true);
  }
}

async function refresh() {
  try {
    const [[ids, names, voteCounts], voter] = await Promise.all([
      contract.getCandidates(),
      contract.voters(account),
    ]);

    candidateList.replaceChildren();
    results.replaceChildren();

    if (ids.length === 0) {
      candidateList.textContent = "No candidates have been added yet.";
      results.textContent = "No results yet.";
      return;
    }

    const voterStatus = voter[1] ? "You have already voted." : voter[0] ? "You are registered and can vote." : "Your wallet has not been registered by the administrator.";
    showMessage(voterStatus, !voter[0]);

    ids.forEach((id, index) => {
      const card = document.createElement("article");
      card.className = "candidate";
      const title = document.createElement("h3");
      title.textContent = names[index];
      const details = document.createElement("p");
      details.textContent = `Candidate ID: ${id}`;
      const voteButton = document.createElement("button");
      voteButton.textContent = voter[1] ? "Already voted" : voter[0] ? "Vote" : "Not registered";
      voteButton.disabled = !voter[0] || voter[1];
      voteButton.addEventListener("click", () => submitVote(id, names[index]));
      card.append(title, details, voteButton);
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

async function submitVote(candidateId, candidateName) {
  try {
    showMessage("Confirm the vote in MetaMask...");
    const transaction = await contract.vote(candidateId);
    showMessage("Vote submitted. Waiting for confirmation...");
    await transaction.wait();
    await refresh();
    showMessage(`Your vote for ${candidateName} has been recorded.`);
  } catch (error) {
    console.error(error);
    showMessage(errorText(error), true);
  }
}

connectWalletButton.addEventListener("click", connectWallet);

if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => window.location.reload());
  window.ethereum.on("chainChanged", () => window.location.reload());
}
