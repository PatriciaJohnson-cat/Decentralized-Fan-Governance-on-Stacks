(define-trait staking-trait
  (
    (get-staked-balance (principal) (response uint uint))
    (get-delegated-balance (principal principal) (response uint uint))
  )
)

(define-trait proposal-trait
  (
    (get-proposal-details (uint) (response {start-block: uint, end-block: uint, quorum: uint, status: (string-ascii 20)} uint))
    (update-proposal-status (uint (string-ascii 20)) (response bool uint))
  )
)

(define-constant ERR-NOT-AUTHORIZED u200)
(define-constant ERR-PROPOSAL-NOT-FOUND u201)
(define-constant ERR-VOTING-NOT-STARTED u202)
(define-constant ERR-VOTING-ENDED u203)
(define-constant ERR-ALREADY-VOTED u204)
(define-constant ERR-INVALID-VOTE-TYPE u205)
(define-constant ERR-INSUFFICIENT-STAKE u206)
(define-constant ERR-INVALID-PROPOSAL-ID u207)
(define-constant ERR-QUORUM-NOT-MET u208)
(define-constant ERR-INVALID-DELEGATE u209)
(define-constant ERR-DELEGATION-EXPIRED u210)
(define-constant ERR-INVALID-QUADRATIC_CALC u211)
(define-constant ERR-PROPOSAL-ALREADY_FINALIZED u212)
(define-constant ERR-INVALID_BLOCK_HEIGHT u213)
(define-constant ERR-STAKING-CONTRACT-NOT-SET u214)
(define-constant ERR-PROPOSAL_CONTRACT-NOT-SET u215)
(define-constant ERR-VOTE_WEIGHT_ZERO u216)
(define-constant ERR-DELEGATE_SELF u217)
(define-constant ERR-VOTE_AFTER_DELEGATION u218)
(define-constant ERR-REVOKE_AFTER_VOTE u219)
(define-constant ERR-INVALID_DURATION u220)

(define-constant VOTE-YES "yes")
(define-constant VOTE-NO "no")
(define-constant VOTE-ABSTAIN "abstain")

(define-constant STATUS-PENDING "pending")
(define-constant STATUS_ACTIVE "active")
(define-constant STATUS_PASSED "passed")
(define-constant STATUS_FAILED "failed")
(define-constant STATUS_QUORUM_FAILED "quorum-failed")

(define-data-var admin principal tx-sender)
(define-data-var staking-contract (optional principal) none)
(define-data-var proposal-contract (optional principal) none)
(define-data-var default-quorum uint u5)
(define-data-var min-vote-weight uint u1)
(define-data-var max-delegation-duration uint u10080)

(define-map proposal-votes
  uint
  {
    yes: uint,
    no: uint,
    abstain: uint,
    total-voted: uint,
    total-stake-at-start: uint,
    end-block: uint,
    finalized: bool
  }
)

(define-map user-votes
  {proposal-id: uint, voter: principal}
  {
    vote-type: (string-ascii 10),
    weight: uint,
    delegated-to: (optional principal)
  }
)

(define-map delegations
  {delegator: principal, delegatee: principal}
  {
    proposal-id: uint,
    expiry-block: uint
  }
)

(define-read-only (get-proposal-vote-tally (proposal-id uint))
  (map-get? proposal-votes proposal-id)
)

(define-read-only (get-user-vote (proposal-id uint) (voter principal))
  (map-get? user-votes {proposal-id: proposal-id, voter: voter})
)

(define-read-only (get-delegation (delegator principal) (delegatee principal))
  (map-get? delegations {delegator: delegator, delegatee: delegatee})
)

(define-read-only (get-staking-contract)
  (var-get staking-contract)
)

(define-read-only (get-proposal-contract)
  (var-get proposal-contract)
)

(define-read-only (get-default-quorum)
  (var-get default-quorum)
)

(define-private (is-admin (caller principal))
  (is-eq caller (var-get admin))
)

(define-private (validate-vote-type (vote (string-ascii 10)))
  (or (is-eq vote VOTE-YES) (is-eq vote VOTE-NO) (is-eq vote VOTE-ABSTAIN))
)

(define-private (validate-proposal-id (id uint))
  (> id u0)
)

(define-private (calculate-quadratic-weight (stake uint))
  (let ((sqrt (unwrap! (sqrti stake) ERR-INVALID-QUADRATIC_CALC)))
    (if (>= sqrt (var-get min-vote-weight)) sqrt u0)
  )
)

(define-private (get-effective-weight (voter principal) (proposal-id uint))
  (let ((staked (try! (contract-call? .staking get-staked-balance voter))))
    (calculate-quadratic-weight staked)
  )
)

(define-private (check-voting-period (proposal-id uint))
  (let ((proposal (try! (contract-call? .proposal get-proposal-details proposal-id))))
    (if (and (>= block-height (get start-block proposal)) (< block-height (get end-block proposal)))
      (ok true)
      (if (< block-height (get start-block proposal))
        (err ERR-VOTING-NOT-STARTED)
        (err ERR-VOTING-ENDED)
      )
    )
  )
)

(define-private (has-not-voted (proposal-id uint) (voter principal))
  (is-none (get-user-vote proposal-id voter))
)

(define-private (is-proposal-active (proposal-id uint))
  (let ((proposal (try! (contract-call? .proposal get-proposal-details proposal-id))))
    (is-eq (get status proposal) STATUS_ACTIVE)
  )
)

(define-public (set-staking-contract (contract principal))
  (if (is-admin tx-sender)
    (ok (var-set staking-contract (some contract)))
    (err ERR-NOT-AUTHORIZED)
  )
)

(define-public (set-proposal-contract (contract principal))
  (if (is-admin tx-sender)
    (ok (var-set proposal-contract (some contract)))
    (err ERR-NOT-AUTHORIZED)
  )
)

(define-public (set-default-quorum (new-quorum uint))
  (if (is-admin tx-sender)
    (if (and (> new-quorum u0) (<= new-quorum u100))
      (ok (var-set default-quorum new-quorum))
      (err ERR-INVALID_VOTING_THRESHOLD)
    )
    (err ERR-NOT-AUTHORIZED)
  )
)

(define-public (initialize-voting (proposal-id uint) (duration uint))
  (let ((proposal-c (unwrap! (var-get proposal-contract) ERR-PROPOSAL_CONTRACT_NOT-SET)))
    (asserts! (is-eq tx-sender proposal-c) (err ERR-NOT-AUTHORIZED))
    (asserts! (validate-proposal-id proposal-id) (err ERR-INVALID-PROPOSAL-ID))
    (asserts! (> duration u0) (err ERR-INVALID_DURATION))
    (let ((total-stake (try! (contract-call? .staking get-staked-balance 'SP000000000000000000002Q6VF78))))
      (map-set proposal-votes proposal-id
        {
          yes: u0,
          no: u0,
          abstain: u0,
          total-voted: u0,
          total-stake-at-start: total-stake,
          end-block: (+ block-height duration),
          finalized: false
        }
      )
      (print {event: "voting-initialized", proposal-id: proposal-id})
      (ok true)
    )
  )
)

(define-public (cast-vote (proposal-id uint) (vote (string-ascii 10)))
  (let ((staking-c (unwrap! (var-get staking-contract) ERR_STAKING_CONTRACT_NOT_SET)))
    (asserts! (validate-proposal-id proposal-id) (err ERR-INVALID-PROPOSAL-ID))
    (asserts! (validate-vote-type vote) (err ERR-INVALID-VOTE-TYPE))
    (try! (check-voting-period proposal-id))
    (asserts! (has-not-voted proposal-id tx-sender) (err ERR-ALREADY-VOTED))
    (asserts! (is-proposal-active proposal-id) (err ERR_PROPOSAL_NOT_FOUND))
    (let ((weight (get-effective-weight tx-sender proposal-id)))
      (asserts! (> weight u0) (err ERR_VOTE_WEIGHT_ZERO))
      (map-set user-votes {proposal-id: proposal-id, voter: tx-sender}
        {
          vote-type: vote,
          weight: weight,
          delegated-to: none
        }
      )
      (let ((votes (unwrap! (get-proposal-vote-tally proposal-id) ERR_PROPOSAL_NOT_FOUND)))
        (map-set proposal-votes proposal-id
          (merge votes
            {
              yes: (if (is-eq vote VOTE-YES) (+ (get yes votes) weight) (get yes votes)),
              no: (if (is-eq vote VOTE-NO) (+ (get no votes) weight) (get no votes)),
              abstain: (if (is-eq vote VOTE-ABSTAIN) (+ (get abstain votes) weight) (get abstain votes)),
              total-voted: (+ (get total-voted votes) weight)
            }
          )
        )
      )
      (print {event: "vote-cast", proposal-id: proposal-id, voter: tx-sender, vote: vote, weight: weight})
      (ok true)
    )
  )
)

(define-public (delegate-vote (proposal-id uint) (delegatee principal))
  (asserts! (validate-proposal-id proposal-id) (err ERR-INVALID-PROPOSAL-ID))
  (try! (check-voting-period proposal-id))
  (asserts! (has-not-voted proposal-id tx-sender) (err ERR_ALREADY_VOTED))
  (asserts! (not (is-eq tx-sender delegatee)) (err ERR_DELEGATE_SELF))
  (map-set delegations {delegator: tx-sender, delegatee: delegatee}
    {
      proposal-id: proposal-id,
      expiry-block: (+ block-height (var-get max-delegation-duration))
    }
  )
  (print {event: "vote-delegated", proposal-id: proposal-id, delegator: tx-sender, delegatee: delegatee})
  (ok true)
)

(define-public (cast-delegated-vote (proposal-id uint) (vote (string-ascii 10)) (delegator principal))
  (asserts! (validate-proposal-id proposal-id) (err ERR-INVALID_PROPOSAL-ID))
  (asserts! (validate-vote-type vote) (err ERR-INVALID_VOTE_TYPE))
  (try! (check-voting-period proposal-id))
  (let ((delegation (unwrap! (get-delegation delegator tx-sender) ERR_INVALID_DELEGATE)))
    (asserts! (is-eq (get proposal-id delegation) proposal-id) (err ERR_INVALID_DELEGATE))
    (asserts! (< block-height (get expiry-block delegation)) (err ERR_DELEGATION_EXPIRED))
    (asserts! (has-not-voted proposal-id delegator) (err ERR_ALREADY_VOTED))
    (let ((weight (get-effective-weight delegator proposal-id)))
      (asserts! (> weight u0) (err ERR_VOTE_WEIGHT_ZERO))
      (map-set user-votes {proposal-id: proposal-id, voter: delegator}
        {
          vote-type: vote,
          weight: weight,
          delegated-to: (some tx-sender)
        }
      )
      (let ((votes (unwrap! (get-proposal-vote-tally proposal-id) ERR_PROPOSAL_NOT_FOUND)))
        (map-set proposal-votes proposal-id
          (merge votes
            {
              yes: (if (is-eq vote VOTE-YES) (+ (get yes votes) weight) (get yes votes)),
              no: (if (is-eq vote VOTE-NO) (+ (get no votes) weight) (get no votes)),
              abstain: (if (is-eq vote VOTE-ABSTAIN) (+ (get abstain votes) weight) (get abstain votes)),
              total-voted: (+ (get total-voted votes) weight)
            }
          )
        )
      )
      (print {event: "delegated-vote-cast", proposal-id: proposal-id, delegator: delegator, delegatee: tx-sender, vote: vote, weight: weight})
      (ok true)
    )
  )
)

(define-public (tally-votes (proposal-id uint))
  (let ((proposal-c (unwrap! (var-get proposal-contract) ERR_PROPOSAL_CONTRACT_NOT_SET)))
    (asserts! (validate-proposal-id proposal-id) (err ERR-INVALID_PROPOSAL-ID))
    (let ((votes (unwrap! (get-proposal-vote-tally proposal-id) ERR_PROPOSAL_NOT_FOUND)))
      (asserts! (not (get finalized votes)) (err ERR_PROPOSAL_ALREADY_FINALIZED))
      (asserts! (>= block-height (get end-block votes)) (err ERR_VOTING_NOT_ENDED))
      (let ((quorum (var-get default-quorum))
            (participation (/ (* (get total-voted votes) u100) (get total-stake-at-start votes))))
        (if (< participation quorum)
          (begin
            (map-set proposal-votes proposal-id (merge votes {finalized: true}))
            (try! (contract-call? .proposal update-proposal-status proposal-id STATUS_QUORUM_FAILED))
            (print {event: "voting-tallied", proposal-id: proposal-id, status: STATUS_QUORUM_FAILED})
            (err ERR_QUORUM_NOT_MET)
          )
          (let ((status (if (> (get yes votes) (get no votes)) STATUS_PASSED STATUS_FAILED)))
            (map-set proposal-votes proposal-id (merge votes {finalized: true}))
            (try! (contract-call? .proposal update-proposal-status proposal-id status))
            (print {event: "voting-tallied", proposal-id: proposal-id, status: status})
            (ok status)
          )
        )
      )
    )
  )
)

(define-public (revoke-delegation (proposal-id uint) (delegatee principal))
  (let ((delegation (get-delegation tx-sender delegatee)))
    (match delegation d
      (if (and (is-eq (get proposal-id d) proposal-id) (< block-height (get expiry-block d)))
        (begin
          (map-delete delegations {delegator: tx-sender, delegatee: delegatee})
          (print {event: "delegation-revoked", proposal-id: proposal-id, delegator: tx-sender, delegatee: delegatee})
          (ok true)
        )
        (err ERR_INVALID_DELEGATE)
      )
      (err ERR_INVALID_DELEGATE)
    )
  )
)