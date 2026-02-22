// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ISemaphore - Minimal Semaphore interface
interface ISemaphore {
    struct SemaphoreProof {
        uint256 merkleTreeDepth;
        uint256 merkleTreeRoot;
        uint256 nullifier;
        uint256 message;
        uint256 scope;
        uint256[8] points;
    }

    function createGroup() external returns (uint256 groupId);
    function addMember(uint256 groupId, uint256 identityCommitment) external;
    function validateProof(uint256 groupId, SemaphoreProof calldata proof) external;
}

/// @title AnonSocial - ZKP-based anonymous social network
contract AnonSocial {
    // ── State ──────────────────────────────────────────────────────────────
    ISemaphore public immutable semaphore;
    uint256 public immutable groupId;

    /// @dev Nullifier hash → used flag (prevents double-post / double-vote)
    mapping(bytes32 => bool) public nullifiers;

    /// @dev postId → net vote count (upvotes - downvotes)
    mapping(bytes32 => int256) public postVotes;

    // ── Events ─────────────────────────────────────────────────────────────
    event PostCreated(bytes32 indexed ipfsHash, uint256 timestamp);
    event VoteCast(bytes32 indexed postId, bool upvote);
    event MemberJoined(uint256 identityCommitment);

    // ── Errors ─────────────────────────────────────────────────────────────
    error NullifierAlreadyUsed();
    error InvalidProof();

    // ── Constructor ────────────────────────────────────────────────────────
    constructor(address _semaphore) {
        semaphore = ISemaphore(_semaphore);
        groupId = ISemaphore(_semaphore).createGroup();
    }

    // ── External Functions ─────────────────────────────────────────────────

    /// @notice Register an anonymous identity commitment to the Semaphore group
    function joinGroup(uint256 identityCommitment) external {
        semaphore.addMember(groupId, identityCommitment);
        emit MemberJoined(identityCommitment);
    }

    /// @notice Create an anonymous post; content is stored on IPFS
    /// @param merkleTreeDepth Depth of the Merkle tree
    /// @param merkleTreeRoot  Root of the Merkle tree at proof generation time
    /// @param nullifierHash   Unique nullifier to prevent double-posting
    /// @param ipfsHash        CID of the post content on IPFS (bytes32 truncated)
    /// @param proof           Groth16 proof points [8]
    function postAnonymous(
        uint256 merkleTreeDepth,
        uint256 merkleTreeRoot,
        uint256 nullifierHash,
        bytes32 ipfsHash,
        uint256[8] calldata proof
    ) external {
        bytes32 nullifierKey = keccak256(abi.encodePacked("post", nullifierHash));
        if (nullifiers[nullifierKey]) revert NullifierAlreadyUsed();

        ISemaphore.SemaphoreProof memory semProof = ISemaphore.SemaphoreProof({
            merkleTreeDepth: merkleTreeDepth,
            merkleTreeRoot: merkleTreeRoot,
            nullifier: nullifierHash,
            message: uint256(ipfsHash),
            scope: uint256(keccak256("anon-social-post")),
            points: proof
        });

        semaphore.validateProof(groupId, semProof);

        nullifiers[nullifierKey] = true;

        emit PostCreated(ipfsHash, block.timestamp);
    }

    /// @notice Cast an anonymous vote on a post
    /// @param merkleTreeDepth Depth of the Merkle tree
    /// @param merkleTreeRoot  Root of the Merkle tree at proof generation time
    /// @param nullifierHash   Unique nullifier to prevent double-voting
    /// @param postId          The ipfsHash of the post being voted on
    /// @param upvote          true = upvote, false = downvote
    /// @param proof           Groth16 proof points [8]
    function voteAnonymous(
        uint256 merkleTreeDepth,
        uint256 merkleTreeRoot,
        uint256 nullifierHash,
        bytes32 postId,
        bool upvote,
        uint256[8] calldata proof
    ) external {
        bytes32 nullifierKey = keccak256(abi.encodePacked("vote", postId, nullifierHash));
        if (nullifiers[nullifierKey]) revert NullifierAlreadyUsed();

        uint256 message = uint256(keccak256(abi.encodePacked(postId, upvote)));

        ISemaphore.SemaphoreProof memory semProof = ISemaphore.SemaphoreProof({
            merkleTreeDepth: merkleTreeDepth,
            merkleTreeRoot: merkleTreeRoot,
            nullifier: nullifierHash,
            message: message,
            scope: uint256(keccak256(abi.encodePacked("anon-social-vote", postId))),
            points: proof
        });

        semaphore.validateProof(groupId, semProof);

        nullifiers[nullifierKey] = true;

        if (upvote) {
            postVotes[postId] += 1;
        } else {
            postVotes[postId] -= 1;
        }

        emit VoteCast(postId, upvote);
    }

    /// @notice Get the current vote count for a post
    function getVotes(bytes32 postId) external view returns (int256) {
        return postVotes[postId];
    }
}
