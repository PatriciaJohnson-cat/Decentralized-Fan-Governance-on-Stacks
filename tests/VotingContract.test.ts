import { describe, it, expect, beforeEach } from "vitest";

const ERR_NOT_AUTHORIZED = 200;
const ERR_PROPOSAL_NOT_FOUND = 201;
const ERR_VOTING_NOT_STARTED = 202;
const ERR_VOTING_ENDED = 203;
const ERR_ALREADY_VOTED = 204;
const ERR_INVALID_VOTE_TYPE = 205;
const ERR_INVALID_PROPOSAL_ID = 207;
const ERR_QUORUM_NOT_MET = 208;
const ERR_INVALID_DELEGATE = 209;
const ERR_DELEGATION_EXPIRED = 210;
const ERR_PROPOSAL_ALREADY_FINALIZED = 212;
const ERR_STAKING_CONTRACT_NOT_SET = 214;
const ERR_PROPOSAL_CONTRACT_NOT_SET = 215;
const ERR_VOTE_WEIGHT_ZERO = 216;
const ERR_DELEGATE_SELF = 217;
const ERR_INVALID_DURATION = 220;
const ERR_INVALID_VOTING_THRESHOLD = 105;

const VOTE_YES = "yes";
const VOTE_NO = "no";
const VOTE_ABSTAIN = "abstain";

const STATUS_ACTIVE = "active";
const STATUS_PASSED = "passed";
const STATUS_FAILED = "failed";
const STATUS_QUORUM_FAILED = "quorum-failed";

interface ProposalVotes {
  yes: number;
  no: number;
  abstain: number;
  totalVoted: number;
  totalStakeAtStart: number;
  endBlock: number;
  finalized: boolean;
}

interface UserVote {
  voteType: string;
  weight: number;
  delegatedTo: string | null;
}

interface Delegation {
  proposalId: number;
  expiryBlock: number;
}

interface ProposalDetails {
  startBlock: number;
  endBlock: number;
  quorum: number;
  status: string;
}

interface Result<T, E> {
  ok: boolean;
  value: T | E;
}

class VotingContractMock {
  state: {
    admin: string;
    stakingContract: string | null;
    proposalContract: string | null;
    defaultQuorum: number;
    minVoteWeight: number;
    maxDelegationDuration: number;
    proposalVotes: Map<number, ProposalVotes>;
    userVotes: Map<string, UserVote>;
    delegations: Map<string, Delegation>;
  } = {
    admin: "",
    stakingContract: null,
    proposalContract: null,
    defaultQuorum: 5,
    minVoteWeight: 1,
    maxDelegationDuration: 10080,
    proposalVotes: new Map(),
    userVotes: new Map(),
    delegations: new Map(),
  };

  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stakedBalances: Map<string, number> = new Map();
  proposalDetails: Map<number, ProposalDetails> = new Map();
  events: Array<{ event: string; [key: string]: any }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      admin: this.caller,
      stakingContract: null,
      proposalContract: null,
      defaultQuorum: 5,
      minVoteWeight: 1,
      maxDelegationDuration: 10080,
      proposalVotes: new Map(),
      userVotes: new Map(),
      delegations: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stakedBalances.set("SP000000000000000000002Q6VF78", 1000000);
    this.stakedBalances.set(this.caller, 10000);
    this.proposalDetails = new Map();
    this.events = [];
  }

  private isAdmin(caller: string): boolean {
    return caller === this.state.admin;
  }

  private validateVoteType(vote: string): boolean {
    return [VOTE_YES, VOTE_NO, VOTE_ABSTAIN].includes(vote);
  }

  private validateProposalId(id: number): boolean {
    return id > 0;
  }

  private calculateQuadraticWeight(stake: number): number {
    const sqrt = Math.floor(Math.sqrt(stake));
    return sqrt >= this.state.minVoteWeight ? sqrt : 0;
  }

  private getEffectiveWeight(voter: string): number {
    const stake = this.stakedBalances.get(voter) || 0;
    return this.calculateQuadraticWeight(stake);
  }

  private checkVotingPeriod(proposalId: number): Result<boolean, number> {
    const proposal = this.proposalDetails.get(proposalId);
    if (!proposal) return { ok: false, value: ERR_PROPOSAL_NOT_FOUND };
    if (this.blockHeight < proposal.startBlock) return { ok: false, value: ERR_VOTING_NOT_STARTED };
    if (this.blockHeight >= proposal.endBlock) return { ok: false, value: ERR_VOTING_ENDED };
    return { ok: true, value: true };
  }

  private hasNotVoted(proposalId: number, voter: string): boolean {
    const key = `${proposalId}-${voter}`;
    return !this.state.userVotes.has(key);
  }

  private isProposalActive(proposalId: number): boolean {
    const proposal = this.proposalDetails.get(proposalId);
    return !!proposal && proposal.status === STATUS_ACTIVE;
  }

  setStakingContract(contract: string): Result<boolean, number> {
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.stakingContract = contract;
    return { ok: true, value: true };
  }

  setProposalContract(contract: string): Result<boolean, number> {
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.proposalContract = contract;
    return { ok: true, value: true };
  }

  setDefaultQuorum(newQuorum: number): Result<boolean, number> {
    if (!this.isAdmin(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newQuorum <= 0 || newQuorum > 100) return { ok: false, value: ERR_INVALID_VOTING_THRESHOLD };
    this.state.defaultQuorum = newQuorum;
    return { ok: true, value: true };
  }

  initializeVoting(proposalId: number, duration: number): Result<boolean, number> {
    if (!this.state.proposalContract) return { ok: false, value: ERR_PROPOSAL_CONTRACT_NOT_SET };
    if (this.caller !== this.state.proposalContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!this.validateProposalId(proposalId)) return { ok: false, value: ERR_INVALID_PROPOSAL_ID };
    if (duration <= 0) return { ok: false, value: ERR_INVALID_DURATION };
    const totalStake = this.stakedBalances.get("SP000000000000000000002Q6VF78") || 0;
    this.state.proposalVotes.set(proposalId, {
      yes: 0,
      no: 0,
      abstain: 0,
      totalVoted: 0,
      totalStakeAtStart: totalStake,
      endBlock: this.blockHeight + duration,
      finalized: false,
    });
    this.events.push({ event: "voting-initialized", proposalId });
    return { ok: true, value: true };
  }

  castVote(proposalId: number, vote: string): Result<boolean, number> {
    if (!this.state.stakingContract) return { ok: false, value: ERR_STAKING_CONTRACT_NOT_SET };
    if (!this.validateProposalId(proposalId)) return { ok: false, value: ERR_INVALID_PROPOSAL_ID };
    if (!this.validateVoteType(vote)) return { ok: false, value: ERR_INVALID_VOTE_TYPE };
    const periodCheck = this.checkVotingPeriod(proposalId);
    if (!periodCheck.ok) return periodCheck;
    if (!this.hasNotVoted(proposalId, this.caller)) return { ok: false, value: ERR_ALREADY_VOTED };
    if (!this.isProposalActive(proposalId)) return { ok: false, value: ERR_PROPOSAL_NOT_FOUND };
    const weight = this.getEffectiveWeight(this.caller);
    if (weight === 0) return { ok: false, value: ERR_VOTE_WEIGHT_ZERO };
    const key = `${proposalId}-${this.caller}`;
    this.state.userVotes.set(key, { voteType: vote, weight, delegatedTo: null });
    const votes = this.state.proposalVotes.get(proposalId)!;
    const updatedVotes = {
      ...votes,
      yes: vote === VOTE_YES ? votes.yes + weight : votes.yes,
      no: vote === VOTE_NO ? votes.no + weight : votes.no,
      abstain: vote === VOTE_ABSTAIN ? votes.abstain + weight : votes.abstain,
      totalVoted: votes.totalVoted + weight,
    };
    this.state.proposalVotes.set(proposalId, updatedVotes);
    this.events.push({ event: "vote-cast", proposalId, voter: this.caller, vote, weight });
    return { ok: true, value: true };
  }

  delegateVote(proposalId: number, delegatee: string): Result<boolean, number> {
    if (!this.validateProposalId(proposalId)) return { ok: false, value: ERR_INVALID_PROPOSAL_ID };
    const periodCheck = this.checkVotingPeriod(proposalId);
    if (!periodCheck.ok) return periodCheck;
    if (!this.hasNotVoted(proposalId, this.caller)) return { ok: false, value: ERR_ALREADY_VOTED };
    if (this.caller === delegatee) return { ok: false, value: ERR_DELEGATE_SELF };
    const delKey = `${this.caller}-${delegatee}`;
    this.state.delegations.set(delKey, {
      proposalId,
      expiryBlock: this.blockHeight + this.state.maxDelegationDuration,
    });
    this.events.push({ event: "vote-delegated", proposalId, delegator: this.caller, delegatee });
    return { ok: true, value: true };
  }

  castDelegatedVote(proposalId: number, vote: string, delegator: string): Result<boolean, number> {
    if (!this.validateProposalId(proposalId)) return { ok: false, value: ERR_INVALID_PROPOSAL_ID };
    if (!this.validateVoteType(vote)) return { ok: false, value: ERR_INVALID_VOTE_TYPE };
    const periodCheck = this.checkVotingPeriod(proposalId);
    if (!periodCheck.ok) return periodCheck;
    const delKey = `${delegator}-${this.caller}`;
    const delegation = this.state.delegations.get(delKey);
    if (!delegation) return { ok: false, value: ERR_INVALID_DELEGATE };
    if (delegation.proposalId !== proposalId) return { ok: false, value: ERR_INVALID_DELEGATE };
    if (this.blockHeight >= delegation.expiryBlock) return { ok: false, value: ERR_DELEGATION_EXPIRED };
    if (!this.hasNotVoted(proposalId, delegator)) return { ok: false, value: ERR_ALREADY_VOTED };
    const weight = this.getEffectiveWeight(delegator);
    if (weight === 0) return { ok: false, value: ERR_VOTE_WEIGHT_ZERO };
    const userKey = `${proposalId}-${delegator}`;
    this.state.userVotes.set(userKey, { voteType: vote, weight, delegatedTo: this.caller });
    const votes = this.state.proposalVotes.get(proposalId)!;
    const updatedVotes = {
      ...votes,
      yes: vote === VOTE_YES ? votes.yes + weight : votes.yes,
      no: vote === VOTE_NO ? votes.no + weight : votes.no,
      abstain: vote === VOTE_ABSTAIN ? votes.abstain + weight : votes.abstain,
      totalVoted: votes.totalVoted + weight,
    };
    this.state.proposalVotes.set(proposalId, updatedVotes);
    this.events.push({ event: "delegated-vote-cast", proposalId, delegator, delegatee: this.caller, vote, weight });
    return { ok: true, value: true };
  }

  tallyVotes(proposalId: number): Result<string, number> {
    if (!this.state.proposalContract) return { ok: false, value: ERR_PROPOSAL_CONTRACT_NOT_SET };
    if (!this.validateProposalId(proposalId)) return { ok: false, value: ERR_INVALID_PROPOSAL_ID };
    const votes = this.state.proposalVotes.get(proposalId);
    if (!votes) return { ok: false, value: ERR_PROPOSAL_NOT_FOUND };
    if (votes.finalized) return { ok: false, value: ERR_PROPOSAL_ALREADY_FINALIZED };
    if (this.blockHeight < votes.endBlock) return { ok: false, value: ERR_VOTING_ENDED };
    const quorum = this.state.defaultQuorum;
    const participation = Math.floor((votes.totalVoted * 100) / votes.totalStakeAtStart);
    if (participation < quorum) {
      this.state.proposalVotes.set(proposalId, { ...votes, finalized: true });
      this.proposalDetails.set(proposalId, { ...this.proposalDetails.get(proposalId)!, status: STATUS_QUORUM_FAILED });
      this.events.push({ event: "voting-tallied", proposalId, status: STATUS_QUORUM_FAILED });
      return { ok: false, value: ERR_QUORUM_NOT_MET };
    }
    const status = votes.yes > votes.no ? STATUS_PASSED : STATUS_FAILED;
    this.state.proposalVotes.set(proposalId, { ...votes, finalized: true });
    this.proposalDetails.set(proposalId, { ...this.proposalDetails.get(proposalId)!, status });
    this.events.push({ event: "voting-tallied", proposalId, status });
    return { ok: true, value: status };
  }

  revokeDelegation(proposalId: number, delegatee: string): Result<boolean, number> {
    const delKey = `${this.caller}-${delegatee}`;
    const delegation = this.state.delegations.get(delKey);
    if (!delegation) return { ok: false, value: ERR_INVALID_DELEGATE };
    if (delegation.proposalId !== proposalId || this.blockHeight >= delegation.expiryBlock) {
      return { ok: false, value: ERR_INVALID_DELEGATE };
    }
    this.state.delegations.delete(delKey);
    this.events.push({ event: "delegation-revoked", proposalId, delegator: this.caller, delegatee });
    return { ok: true, value: true };
  }
}

describe("VotingContractMock", () => {
  let contract: VotingContractMock;

  beforeEach(() => {
    contract = new VotingContractMock();
    contract.reset();
  });

  it("sets staking contract successfully", () => {
    const result = contract.setStakingContract("ST2STAKING");
    expect(result.ok).toBe(true);
    expect(contract.state.stakingContract).toBe("ST2STAKING");
  });

  it("rejects setting staking contract by non-admin", () => {
    contract.caller = "ST3FAKE";
    const result = contract.setStakingContract("ST2STAKING");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets proposal contract successfully", () => {
    const result = contract.setProposalContract("ST3PROPOSAL");
    expect(result.ok).toBe(true);
    expect(contract.state.proposalContract).toBe("ST3PROPOSAL");
  });

  it("sets default quorum successfully", () => {
    const result = contract.setDefaultQuorum(10);
    expect(result.ok).toBe(true);
    expect(contract.state.defaultQuorum).toBe(10);
  });

  it("rejects invalid quorum", () => {
    const result = contract.setDefaultQuorum(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_VOTING_THRESHOLD);
  });

  it("initializes voting successfully", () => {
    contract.setProposalContract("ST3PROPOSAL");
    contract.caller = "ST3PROPOSAL";
    const result = contract.initializeVoting(1, 100);
    expect(result.ok).toBe(true);
    const votes = contract.state.proposalVotes.get(1);
    expect(votes?.endBlock).toBe(100);
    expect(votes?.totalStakeAtStart).toBe(1000000);
    expect(contract.events[0].event).toBe("voting-initialized");
  });

  it("rejects initialization by non-proposal contract", () => {
    contract.setProposalContract("ST3PROPOSAL");
    const result = contract.initializeVoting(1, 100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("casts vote successfully", () => {
    contract.setStakingContract("ST2STAKING");
    contract.setProposalContract("ST3PROPOSAL");
    contract.caller = "ST3PROPOSAL";
    contract.initializeVoting(1, 100);
    contract.proposalDetails.set(1, { startBlock: 0, endBlock: 100, quorum: 5, status: STATUS_ACTIVE });
    contract.caller = "ST1TEST";
    const result = contract.castVote(1, VOTE_YES);
    expect(result.ok).toBe(true);
    const userKey = "1-ST1TEST";
    const userVote = contract.state.userVotes.get(userKey);
    expect(userVote?.voteType).toBe(VOTE_YES);
    expect(userVote?.weight).toBeGreaterThan(0);
    const votes = contract.state.proposalVotes.get(1);
    expect(votes?.yes).toBe(userVote?.weight);
    expect(contract.events[1].event).toBe("vote-cast");
  });

  it("rejects vote with zero weight", () => {
    contract.setStakingContract("ST2STAKING");
    contract.setProposalContract("ST3PROPOSAL");
    contract.caller = "ST3PROPOSAL";
    contract.initializeVoting(1, 100);
    contract.proposalDetails.set(1, { startBlock: 0, endBlock: 100, quorum: 5, status: STATUS_ACTIVE });
    contract.stakedBalances.set("ST1TEST", 0);
    contract.caller = "ST1TEST";
    const result = contract.castVote(1, VOTE_YES);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_VOTE_WEIGHT_ZERO);
  });

  it("delegates vote successfully", () => {
    contract.setProposalContract("ST3PROPOSAL");
    contract.proposalDetails.set(1, { startBlock: 0, endBlock: 100, quorum: 5, status: STATUS_ACTIVE });
    const result = contract.delegateVote(1, "ST4DELEGATE");
    expect(result.ok).toBe(true);
    const delKey = "ST1TEST-ST4DELEGATE";
    const delegation = contract.state.delegations.get(delKey);
    expect(delegation?.proposalId).toBe(1);
    expect(contract.events[0].event).toBe("vote-delegated");
  });

  it("rejects self-delegation", () => {
    contract.proposalDetails.set(1, { startBlock: 0, endBlock: 100, quorum: 5, status: STATUS_ACTIVE });
    const result = contract.delegateVote(1, "ST1TEST");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_DELEGATE_SELF);
  });

  it("casts delegated vote successfully", () => {
    contract.setStakingContract("ST2STAKING");
    contract.setProposalContract("ST3PROPOSAL");
    contract.caller = "ST3PROPOSAL";
    contract.initializeVoting(1, 100);
    contract.proposalDetails.set(1, { startBlock: 0, endBlock: 100, quorum: 5, status: STATUS_ACTIVE });
    contract.stakedBalances.set("ST5DELEGATOR", 10000);
    contract.caller = "ST5DELEGATOR";
    contract.delegateVote(1, "ST6DELEGATEE");
    contract.caller = "ST6DELEGATEE";
    const result = contract.castDelegatedVote(1, VOTE_NO, "ST5DELEGATOR");
    expect(result.ok).toBe(true);
    const userKey = "1-ST5DELEGATOR";
    const userVote = contract.state.userVotes.get(userKey);
    expect(userVote?.voteType).toBe(VOTE_NO);
    const votes = contract.state.proposalVotes.get(1);
    expect(votes?.no).toBe(userVote?.weight);
    expect(contract.events[2].event).toBe("delegated-vote-cast");
  });

  it("tallies votes with quorum failure", () => {
    contract.setStakingContract("ST2STAKING");
    contract.setProposalContract("ST3PROPOSAL");
    contract.caller = "ST3PROPOSAL";
    contract.initializeVoting(1, 100);
    contract.proposalDetails.set(1, { startBlock: 0, endBlock: 100, quorum: 5, status: STATUS_ACTIVE });
    contract.blockHeight = 100;
    const result = contract.tallyVotes(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_QUORUM_NOT_MET);
    const proposal = contract.proposalDetails.get(1);
    expect(proposal?.status).toBe(STATUS_QUORUM_FAILED);
  });

  it("revokes delegation successfully", () => {
    contract.proposalDetails.set(1, { startBlock: 0, endBlock: 100, quorum: 5, status: STATUS_ACTIVE });
    contract.delegateVote(1, "ST4DELEGATE");
    const result = contract.revokeDelegation(1, "ST4DELEGATE");
    expect(result.ok).toBe(true);
    const delKey = "ST1TEST-ST4DELEGATE";
    expect(contract.state.delegations.has(delKey)).toBe(false);
    expect(contract.events[1].event).toBe("delegation-revoked");
  });

  it("rejects revocation of invalid delegation", () => {
    const result = contract.revokeDelegation(1, "ST4DELEGATE");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DELEGATE);
  });
});