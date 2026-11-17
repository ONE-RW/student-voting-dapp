// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Voting {

    // Stores information about a candidate
    struct Candidate {
        uint id;
        string name;
        uint voteCount;
    }

    // Stores information about a voter
    struct Voter {
        bool isRegistered;
        bool hasVoted;
    }

    // Stores candidates using their ID
    mapping(uint => Candidate) public candidates;

    // Stores voter information using blockchain addresses
    mapping(address => Voter) public voters;

    // Stores the total number of candidates
    uint public candidatesCount;

    // Stores the contract administrator
    address public administrator;

    // Event emitted when a voter is registered
    event VoterRegistered(address indexed voter);

    // Event emitted when a candidate is added
    event CandidateAdded(
        uint indexed candidateId,
        string candidateName
    );
    // Event emitted when a vote is successfully cast
    event VoteCast(
        address indexed voter,
        uint indexed candidateId
    );

    // Runs when the contract is deployed
    constructor() {
        administrator = msg.sender;
    }

    // Adds a new candidate
    function addCandidate(string memory _name) public {
        require(
            msg.sender == administrator,
            "Only the administrator can add candidates"
        );

        require(
            bytes(_name).length > 0,
            "Candidate name cannot be empty"
        );

        candidatesCount++;

        candidates[candidatesCount] = Candidate(
            candidatesCount,
            _name,
            0
        );

        emit CandidateAdded(candidatesCount, _name);
    }

    // Retrieves information about one candidate
    function getCandidate(uint _candidateId)
        public
        view
        returns (uint, string memory, uint)
    {
        require(
            _candidateId > 0 &&
            _candidateId <= candidatesCount,
            "Invalid candidate ID"
        );

        Candidate memory candidate = candidates[_candidateId];

        return (
            candidate.id,
            candidate.name,
            candidate.voteCount
        );
    }

    // Retrieves information about all candidates
    function getCandidates()
        public
        view
        returns (
            uint[] memory,
            string[] memory,
            uint[] memory
        )
    {
        uint[] memory ids = new uint[](candidatesCount);
        string[] memory names = new string[](candidatesCount);
        uint[] memory voteCounts = new uint[](candidatesCount);

        for (uint i = 1; i <= candidatesCount; i++) {
            Candidate memory candidate = candidates[i];

            ids[i - 1] = candidate.id;
            names[i - 1] = candidate.name;
            voteCounts[i - 1] = candidate.voteCount;
        }

        return (ids, names, voteCounts);
    }

    // Registers a voter
    function registerVoter(address _voter) public {
        require(
            msg.sender == administrator,
            "Only the administrator can register voters"
        );

        require(_voter != address(0), "Invalid voter address");
        require(!voters[_voter].isRegistered, "Voter is already registered");

        voters[_voter].isRegistered = true;

        emit VoterRegistered(_voter);
    }

    // Allows a registered voter to vote only once
    function vote(uint _candidateId) public {
        require(
            voters[msg.sender].isRegistered,
            "You are not registered to vote"
        );

        require(
            !voters[msg.sender].hasVoted,
            "You have already voted"
        );

        require(
            _candidateId > 0 &&
            _candidateId <= candidatesCount,
            "Invalid candidate ID"
        );

        voters[msg.sender].hasVoted = true;
        candidates[_candidateId].voteCount++;

        emit VoteCast(msg.sender, _candidateId);
    }

}
