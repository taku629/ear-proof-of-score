use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::LookupMap;
use near_sdk::json_types::{U128, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, ext_contract, near, AccountId, Gas, NearToken, PanicOnDefault, Promise};
#[cfg(not(target_arch = "wasm32"))]
use schemars::JsonSchema;

const MIN_POINTS: usize = 3;
const MAX_POINTS: usize = 40;
const MAX_COORD: i32 = 10_000;
const MIN_DURATION_SECONDS: u64 = 60;
const MAX_DURATION_SECONDS: u64 = 7 * 24 * 60 * 60;
const NANOS_PER_SECOND: u64 = 1_000_000_000;
const STORAGE_BUFFER_BYTES: u64 = 256;
const CALLBACK_GAS: Gas = Gas::from_tgas(5);

#[derive(BorshDeserialize, BorshSerialize, Clone)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

#[derive(BorshDeserialize, BorshSerialize, Clone)]
pub struct BestSubmission {
    pub solver: AccountId,
    pub score: u64,
    pub route: Vec<u16>,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, PartialEq, Eq, Debug)]
pub enum ChallengeState {
    Open,
    Finalized,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, PartialEq, Eq, Debug)]
pub enum PayoutState {
    Unclaimed,
    Pending,
    Paid,
}

#[derive(BorshDeserialize, BorshSerialize, Clone)]
pub struct Challenge {
    pub id: u64,
    pub creator: AccountId,
    pub points: Vec<Point>,
    pub created_at_ns: u64,
    pub deadline_ns: u64,
    pub bounty_yocto: u128,
    pub storage_reserve_yocto: u128,
    pub state: ChallengeState,
    pub best: Option<BestSubmission>,
    pub submission_count: u64,
    pub payout_recipient: Option<AccountId>,
    pub payout_state: PayoutState,
}

#[derive(Serialize, Deserialize, Clone)]
#[cfg_attr(not(target_arch = "wasm32"), derive(JsonSchema))]
#[serde(crate = "near_sdk::serde")]
pub struct PointView {
    pub x: i32,
    pub y: i32,
}

#[derive(Serialize, Deserialize, Clone)]
#[cfg_attr(not(target_arch = "wasm32"), derive(JsonSchema))]
#[serde(crate = "near_sdk::serde", rename_all = "snake_case")]
pub enum ChallengeStatusView {
    Open,
    Finalized,
}

#[derive(Serialize, Deserialize, Clone)]
#[cfg_attr(not(target_arch = "wasm32"), derive(JsonSchema))]
#[serde(crate = "near_sdk::serde", rename_all = "snake_case")]
pub enum PayoutStatusView {
    Unclaimed,
    Pending,
    Paid,
}

#[derive(Serialize, Deserialize, Clone)]
#[cfg_attr(not(target_arch = "wasm32"), derive(JsonSchema))]
#[serde(crate = "near_sdk::serde")]
pub struct BestSubmissionView {
    pub solver: AccountId,
    pub score: u64,
    pub route: Vec<u16>,
}

#[derive(Serialize, Deserialize, Clone)]
#[cfg_attr(not(target_arch = "wasm32"), derive(JsonSchema))]
#[serde(crate = "near_sdk::serde")]
pub struct ChallengeView {
    pub id: u64,
    pub creator: AccountId,
    pub points: Vec<PointView>,
    pub created_at_ns: U64,
    pub deadline_ns: U64,
    pub bounty_yocto: U128,
    pub storage_reserve_yocto: U128,
    pub status: ChallengeStatusView,
    pub best: Option<BestSubmissionView>,
    pub submission_count: u64,
    pub payout_recipient: Option<AccountId>,
    pub payout_status: PayoutStatusView,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    next_challenge_id: u64,
    challenges: LookupMap<u64, Challenge>,
}

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        Self {
            next_challenge_id: 1,
            challenges: LookupMap::new(b"c"),
        }
    }

    /// Register a closed-tour TSP challenge and lock the attached NEAR as its bounty.
    #[payable]
    pub fn create_bounty(
        &mut self,
        points: Vec<PointView>,
        duration_seconds: u64,
    ) -> ChallengeView {
        let total_deposit = env::attached_deposit().as_yoctonear();
        assert!(total_deposit > 0, "Attach a non-zero NEAR deposit");
        assert!(
            (MIN_POINTS..=MAX_POINTS).contains(&points.len()),
            "Point count must be between 3 and 40"
        );
        assert!(
            (MIN_DURATION_SECONDS..=MAX_DURATION_SECONDS).contains(&duration_seconds),
            "Duration must be between 60 seconds and 7 days"
        );
        for point in &points {
            assert!(
                (-MAX_COORD..=MAX_COORD).contains(&point.x)
                    && (-MAX_COORD..=MAX_COORD).contains(&point.y),
                "Coordinates must be between -10000 and 10000"
            );
        }

        let now = env::block_timestamp();
        let duration_ns = duration_seconds
            .checked_mul(NANOS_PER_SECOND)
            .expect("Duration overflow");
        let deadline_ns = now.checked_add(duration_ns).expect("Deadline overflow");
        let id = self.next_challenge_id;
        self.next_challenge_id = id.checked_add(1).expect("Challenge ID overflow");
        let mut challenge = Challenge {
            id,
            creator: env::predecessor_account_id(),
            points: points
                .into_iter()
                .map(|point| Point {
                    x: point.x,
                    y: point.y,
                })
                .collect(),
            created_at_ns: now,
            deadline_ns,
            bounty_yocto: total_deposit,
            storage_reserve_yocto: 0,
            state: ChallengeState::Open,
            best: None,
            submission_count: 0,
            payout_recipient: None,
            payout_state: PayoutState::Unclaimed,
        };
        let storage_before = env::storage_usage();
        self.challenges.insert(&id, &challenge);
        let state_bytes = env::storage_usage().saturating_sub(storage_before);
        let reserve_bytes = state_bytes
            .checked_add(STORAGE_BUFFER_BYTES)
            .expect("Storage reserve byte count overflow");
        let storage_reserve = env::storage_byte_cost()
            .as_yoctonear()
            .checked_mul(u128::from(reserve_bytes))
            .expect("Storage reserve cost overflow");
        assert!(
            total_deposit > storage_reserve,
            "Deposit is too small to cover the bounty and permanent storage reserve"
        );
        challenge.storage_reserve_yocto = storage_reserve;
        challenge.bounty_yocto = total_deposit - storage_reserve;
        self.challenges.insert(&id, &challenge);
        Self::to_view(challenge)
    }

    /// Score a closed tour on-chain; only a strictly better score replaces the incumbent.
    pub fn submit_solution(&mut self, challenge_id: u64, route: Vec<u16>) -> u64 {
        let mut challenge = self
            .challenges
            .get(&challenge_id)
            .unwrap_or_else(|| env::panic_str("Challenge not found"));
        assert_eq!(
            challenge.state,
            ChallengeState::Open,
            "Challenge is finalized"
        );
        assert!(
            env::block_timestamp() < challenge.deadline_ns,
            "Submission deadline has passed"
        );
        Self::validate_route(&route, challenge.points.len());
        let score = Self::score_route(&challenge.points, &route);
        challenge.submission_count = challenge
            .submission_count
            .checked_add(1)
            .expect("Submission count overflow");
        let is_better = challenge
            .best
            .as_ref()
            .map(|best| score < best.score)
            .unwrap_or(true);
        if is_better {
            challenge.best = Some(BestSubmission {
                solver: env::predecessor_account_id(),
                score,
                route,
            });
        }
        self.challenges.insert(&challenge_id, &challenge);
        score
    }

    /// Anyone may finalize a challenge after its deadline. The current winner (or creator
    /// when nobody submitted) becomes the sole payout recipient.
    pub fn finalize(&mut self, challenge_id: u64) -> ChallengeView {
        let mut challenge = self
            .challenges
            .get(&challenge_id)
            .unwrap_or_else(|| env::panic_str("Challenge not found"));
        assert_eq!(
            challenge.state,
            ChallengeState::Open,
            "Challenge is already finalized"
        );
        assert!(
            env::block_timestamp() >= challenge.deadline_ns,
            "Challenge is still open"
        );
        challenge.state = ChallengeState::Finalized;
        challenge.payout_recipient = Some(
            challenge
                .best
                .as_ref()
                .map(|best| best.solver.clone())
                .unwrap_or_else(|| challenge.creator.clone()),
        );
        self.challenges.insert(&challenge_id, &challenge);
        Self::to_view(challenge)
    }

    /// The frozen payout recipient withdraws after finalization. A callback unlocks a retry
    /// if the transfer fails, and prevents double claims while the transfer is in flight.
    pub fn claim_payout(&mut self, challenge_id: u64) -> Promise {
        let mut challenge = self
            .challenges
            .get(&challenge_id)
            .unwrap_or_else(|| env::panic_str("Challenge not found"));
        assert_eq!(
            challenge.state,
            ChallengeState::Finalized,
            "Challenge is not finalized"
        );
        let recipient = challenge
            .payout_recipient
            .clone()
            .unwrap_or_else(|| env::panic_str("Payout recipient is missing"));
        assert_eq!(
            env::predecessor_account_id(),
            recipient,
            "Only the payout recipient can claim"
        );
        assert_eq!(
            challenge.payout_state,
            PayoutState::Unclaimed,
            "Payout is already claimed or pending"
        );

        challenge.payout_state = PayoutState::Pending;
        let amount = challenge.bounty_yocto;
        self.challenges.insert(&challenge_id, &challenge);
        Promise::new(recipient)
            .transfer(NearToken::from_yoctonear(amount))
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .on_payout_complete(challenge_id),
            )
    }

    #[private]
    pub fn on_payout_complete(&mut self, challenge_id: u64) -> bool {
        let mut challenge = self
            .challenges
            .get(&challenge_id)
            .unwrap_or_else(|| env::panic_str("Challenge not found"));
        assert_eq!(
            challenge.state,
            ChallengeState::Finalized,
            "Challenge is not finalized"
        );
        assert_eq!(
            challenge.payout_state,
            PayoutState::Pending,
            "No payout is pending"
        );
        let succeeded = env::promise_result_checked(0, 1).is_ok();
        challenge.payout_state = if succeeded {
            PayoutState::Paid
        } else {
            PayoutState::Unclaimed
        };
        self.challenges.insert(&challenge_id, &challenge);
        succeeded
    }

    pub fn get_challenge(&self, challenge_id: u64) -> Option<ChallengeView> {
        self.challenges.get(&challenge_id).map(Self::to_view)
    }

    /// IDs are sequential and start at 1. `from_id` is inclusive; callers should cap `limit`.
    pub fn get_challenges(&self, from_id: u64, limit: u64) -> Vec<ChallengeView> {
        assert!(limit <= 20, "Limit cannot exceed 20");
        let start = from_id.max(1);
        let end = start.saturating_add(limit).min(self.next_challenge_id);
        (start..end)
            .filter_map(|id| self.challenges.get(&id).map(Self::to_view))
            .collect()
    }

    pub fn get_challenge_count(&self) -> u64 {
        self.next_challenge_id - 1
    }

    fn validate_route(route: &[u16], point_count: usize) {
        assert_eq!(
            route.len(),
            point_count,
            "Route must visit every point once"
        );
        let mut visited = vec![false; point_count];
        for index in route {
            let index = *index as usize;
            assert!(index < point_count, "Route contains an invalid point index");
            assert!(!visited[index], "Route contains a duplicate point");
            visited[index] = true;
        }
    }

    fn score_route(points: &[Point], route: &[u16]) -> u64 {
        let mut total = 0u64;
        for i in 0..route.len() {
            let a = &points[route[i] as usize];
            let b = &points[route[(i + 1) % route.len()] as usize];
            total = total
                .checked_add(Self::distance(a, b))
                .expect("Score overflow");
        }
        total
    }

    fn distance(a: &Point, b: &Point) -> u64 {
        let dx = (a.x as i64 - b.x as i64) as i128;
        let dy = (a.y as i64 - b.y as i64) as i128;
        let squared = (dx * dx + dy * dy) as u64;
        Self::integer_sqrt(squared)
    }

    fn integer_sqrt(n: u64) -> u64 {
        if n < 2 {
            return n;
        }
        let mut x = n;
        let mut y = (x + 1) / 2;
        while y < x {
            x = y;
            y = (x + n / x) / 2;
        }
        x
    }

    fn to_view(challenge: Challenge) -> ChallengeView {
        ChallengeView {
            id: challenge.id,
            creator: challenge.creator,
            points: challenge
                .points
                .into_iter()
                .map(|point| PointView {
                    x: point.x,
                    y: point.y,
                })
                .collect(),
            created_at_ns: U64(challenge.created_at_ns),
            deadline_ns: U64(challenge.deadline_ns),
            bounty_yocto: U128(challenge.bounty_yocto),
            storage_reserve_yocto: U128(challenge.storage_reserve_yocto),
            status: match challenge.state {
                ChallengeState::Open => ChallengeStatusView::Open,
                ChallengeState::Finalized => ChallengeStatusView::Finalized,
            },
            best: challenge.best.map(|best| BestSubmissionView {
                solver: best.solver,
                score: best.score,
                route: best.route,
            }),
            submission_count: challenge.submission_count,
            payout_recipient: challenge.payout_recipient,
            payout_status: match challenge.payout_state {
                PayoutState::Unclaimed => PayoutStatusView::Unclaimed,
                PayoutState::Pending => PayoutStatusView::Pending,
                PayoutState::Paid => PayoutStatusView::Paid,
            },
        }
    }
}

#[ext_contract(ext_self)]
pub trait ExtSelf {
    fn on_payout_complete(&mut self, challenge_id: u64) -> bool;
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{testing_env, NearToken};

    fn set_context(account: &str, deposit: u128, timestamp: u64) {
        let context = VMContextBuilder::new()
            .predecessor_account_id(account.parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .block_timestamp(timestamp)
            .build();
        testing_env!(context);
    }

    fn test_deposit() -> u128 {
        NearToken::from_near(10).as_yoctonear()
    }

    fn sample_points() -> Vec<PointView> {
        vec![
            PointView { x: 0, y: 0 },
            PointView { x: 3, y: 4 },
            PointView { x: 6, y: 0 },
        ]
    }

    #[test]
    fn bounty_scores_and_keeps_the_best_route() {
        set_context("creator.testnet", test_deposit(), 1_000_000_000);
        let mut contract = Contract::new();
        let created = contract.create_bounty(sample_points(), 60);
        assert_eq!(created.id, 1);
        assert!(created.bounty_yocto.0 > 0);
        assert!(created.storage_reserve_yocto.0 > 0);
        assert_eq!(
            created.bounty_yocto.0 + created.storage_reserve_yocto.0,
            test_deposit()
        );

        set_context("solver.testnet", 0, 2_000_000_000);
        let score = contract.submit_solution(1, vec![0, 1, 2]);
        assert_eq!(score, 16); // 5 + 5 + 6, including the closing edge.

        set_context("other.testnet", 0, 3_000_000_000);
        contract.submit_solution(1, vec![0, 2, 1]); // Same score: first submission wins ties.
        let view = contract.get_challenge(1).unwrap();
        assert_eq!(view.submission_count, 2);
        assert_eq!(
            view.best.unwrap().solver,
            "solver.testnet".parse::<AccountId>().unwrap()
        );
    }

    #[test]
    fn finalization_freezes_winner_or_refunds_creator_when_empty() {
        set_context("creator.testnet", test_deposit(), 1_000_000_000);
        let mut contract = Contract::new();
        contract.create_bounty(sample_points(), 60);

        set_context("solver.testnet", 0, 2_000_000_000);
        contract.submit_solution(1, vec![0, 1, 2]);
        set_context("keeper.testnet", 0, 61_000_000_000);
        let finalized = contract.finalize(1);
        assert_eq!(
            finalized.payout_recipient.unwrap(),
            "solver.testnet".parse::<AccountId>().unwrap()
        );
        assert!(matches!(finalized.status, ChallengeStatusView::Finalized));

        set_context("creator.testnet", test_deposit(), 1_000_000_000);
        contract.create_bounty(sample_points(), 60);
        set_context("keeper.testnet", 0, 61_000_000_000);
        let refund = contract.finalize(2);
        assert_eq!(
            refund.payout_recipient.unwrap(),
            "creator.testnet".parse::<AccountId>().unwrap()
        );
    }

    #[test]
    fn integer_square_root_is_deterministic_floor_distance() {
        assert_eq!(Contract::integer_sqrt(0), 0);
        assert_eq!(Contract::integer_sqrt(1), 1);
        assert_eq!(Contract::integer_sqrt(24), 4);
        assert_eq!(Contract::integer_sqrt(25), 5);
        assert_eq!(
            Contract::distance(&Point { x: 0, y: 0 }, &Point { x: 3, y: 4 }),
            5
        );
    }

    #[test]
    fn storage_buffer_covers_worst_case_best_and_recipient_growth() {
        let points = (0..40).map(|i| PointView { x: i, y: i * i }).collect();
        set_context("creator.testnet", test_deposit(), 1_000_000_000);
        let mut contract = Contract::new();
        contract.create_bounty(points, 60);
        let initial_challenge = contract.challenges.get(&1).unwrap();
        let initial_state_len = borsh::to_vec(&initial_challenge).unwrap().len();

        let longest_account_id = "a".repeat(64);
        set_context(&longest_account_id, 0, 2_000_000_000);
        contract.submit_solution(1, (0u16..40).collect());
        set_context("keeper.testnet", 0, 61_000_000_000);
        contract.finalize(1);

        let finalized_challenge = contract.challenges.get(&1).unwrap();
        let final_state_len = borsh::to_vec(&finalized_challenge).unwrap().len();
        let state_growth = final_state_len.saturating_sub(initial_state_len);
        assert!(state_growth > 0);
        assert!(
            state_growth <= STORAGE_BUFFER_BYTES as usize,
            "The fixed reserve must cover the maximum route and payout recipient"
        );
    }
}
