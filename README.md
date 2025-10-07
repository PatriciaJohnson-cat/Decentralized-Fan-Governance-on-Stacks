# FanDAO: Decentralized Fan Governance on Stacks

## Project Overview

**FanDAO** is a Web3 platform built on the Stacks blockchain using Clarity smart contracts. It empowers sports club fans (or any community "club") by issuing governance tokens that allow token holders to propose and vote on real-world club decisions, such as player signings, kit designs, match-day events, or even charitable initiatives. Fans earn tokens through engagement (e.g., attending games via NFT proofs or social contributions) and use them to influence outcomes transparently.

### Real-World Problems Solved
- **Fan Disengagement**: Traditional clubs treat fans as passive consumers. FanDAO turns them into active stakeholders, boosting loyalty and attendance (e.g., NBA teams report 20-30% higher retention with fan-voted perks).
- **Opaque Decision-Making**: Blockchain ensures immutable, verifiable votes, reducing corruption scandals (like FIFA controversies).
- **Revenue Diversification**: Clubs issue tokens for crowdfunding (e.g., stadium upgrades), with 5-10% transaction fees funding operations—similar to how Chiliz's Socios.com raised millions for FC Barcelona.
- **Inclusivity**: Global fans, especially in underserved regions, participate without geographic barriers, fostering diverse input.
- **Sustainability**: Voting on eco-friendly initiatives (e.g., carbon-neutral travel) aligns clubs with modern ESG goals.

The platform uses Stacks for Bitcoin-anchored security, low fees, and fast finality, making it accessible for non-crypto natives.

## Architecture
- **Frontend**: React app for proposal creation, voting, and dashboards (not included here; integrate via Hiro Wallet).
- **Backend**: Clarity smart contracts deployed on Stacks mainnet/testnet.
- **Off-Chain**: IPFS for proposal metadata; Oracle for real-world execution (e.g., club API confirms vote outcomes).
- **Tokenomics**: $FAN token (SIP-010 fungible). Total supply: 1B. 40% to fans via airdrops/quests, 30% to club treasury, 20% liquidity, 10% team/vesting.

## Smart Contracts (6 Core Contracts)
All contracts are written in Clarity v2, using standard traits (e.g., `SIP-010` for tokens, `FTTrait` for transfers). They form a modular DAO stack. Deploy order: Token → Treasury → Staking → Proposal → Voting → Rewards.

### 1. `fan-token.clar` (SIP-010 Fungible Token)
   - **Purpose**: Issues and manages $FAN tokens for fans and club.
   - **Key Functions**:
     - `mint`: Club admin mints tokens (e.g., for rewards or sales).
     - `transfer`: Standard transfers with optional 1% fee to treasury.
     - `get-balance`: Query balances.
   - **Traits**: Implements `SIP-010`.
   - **Real-World Tie-In**: Tokens represent "fan shares" for voting power.
   - **Security**: Admin-only minting with multisig upgradeability.

### 2. `treasury.clar`
   - **Purpose**: Manages club funds from token fees, donations, and vote bounties.
   - **Key Functions**:
     - `deposit`: Accepts $FAN or STX.
     - `withdraw`: Admin withdraws for club expenses (with timelock).
     - `propose-spend`: Token holders propose treasury spends via voting integration.
     - `execute-spend`: Executes approved spends.
   - **Traits**: Custom error handling for insufficient funds.
   - **Real-World Tie-In**: Funds real decisions like "vote to allocate $10K for youth academy."
   - **Security**: 7-day timelock on large withdrawals; quorum checks.

### 3. `staking.clar`
   - **Purpose**: Allows fans to stake $FAN tokens to gain voting power (prevents sybil attacks).
   - **Key Functions**:
     - `stake`: Lock tokens for a period (e.g., 30 days min).
     - `unstake`: Withdraw after lockup, with slashing for bad behavior (e.g., vote buying reports).
     - `get-staked-balance`: Query effective voting power.
   - **Traits**: Integrates with `SIP-010` for token locking.
   - **Real-World Tie-In**: Encourages long-term loyalty; staked tokens earn yield from treasury.
   - **Security**: Time-based locks; emergency unstake via governance vote.

### 4. `proposal.clar`
   - **Purpose**: Creates and manages governance proposals.
   - **Key Functions**:
     - `create-proposal`: Submit proposal with title, description (IPFS hash), type (e.g., binary vote or treasury spend), and min deposit ($FAN burn to spam-proof).
     - `update-proposal`: Edit before voting starts (admin only).
     - `get-proposal`: Query details and status (active/pending/passed/failed).
   - **Traits**: Event emissions for frontend indexing.
   - **Real-World Tie-In**: Proposals like "Sign Player X?" with oracle-fed outcomes.
   - **Security**: Proposal thresholds (e.g., 1% total supply deposit); 48-hour discussion period.

### 5. `voting.clar`
   - **Purpose**: Handles secure, quadratic voting (to amplify small holders).
   - **Key Functions**:
     - `cast-vote`: Vote yes/no/abstain using staked balance (quadratic formula: votes = sqrt(staked_amount)).
     - `tally-vote`: End voting and compute results (quorum: 5% participation).
     - `get-vote`: Query user votes.
   - **Traits**: Integrates with staking and proposal contracts.
   - **Real-World Tie-In**: Quadratic voting ensures fair influence, solving whale dominance in fan polls.
   - **Security**: One-vote-per-proposal per wallet; delegation option for absent fans.

### 6. `rewards.clar`
   - **Purpose**: Distributes $FAN rewards for participation (voting, proposing).
   - **Key Functions**:
     - `claim-reward`: Claim based on activity score (e.g., 1% of vote participation pool).
     - `distribute`: Periodic admin call to allocate from treasury.
     - `get-pending-reward`: Query eligibility.
   - **Traits**: `SIP-010` mint integration.
   - **Real-World Tie-In**: Rewards boost engagement, e.g., top voters get VIP tickets (NFT airdrop).
   - **Security**: Vesting schedule (e.g., 50% immediate, 50% over 90 days); cap per user.

## Deployment & Testing
- **Tools**: Use Clarinet for local testing; deploy via Hiro CLI.
- **Testnet**: Deploy to Stacks testnet; mint initial tokens to test voting flow.
- **Integration**: Contracts reference each other (e.g., voting calls staking for power).
- **Upgrades**: Proxy pattern for future iterations.

## Getting Started
1. Clone repo: `git clone <repo-url>`
2. Install Clarinet: `cargo install clarinet`
3. Run tests: `clarinet test`
4. Deploy: `clarinet deploy --network testnet`
5. Frontend: Build with `@stacks/connect` for wallet integration.


## License
MIT. Contributions welcome!