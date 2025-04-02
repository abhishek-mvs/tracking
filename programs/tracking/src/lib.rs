use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock::Clock;

declare_id!("FEp1TVQcRzbcYH9NEpXrdbSj5EUe9PRy6kY1yzKUMqkx");

#[program]
pub mod tracking_system {
    use super::*;

    // Initialize the tracker registry (any user can do this)
    pub fn initialize(
        ctx: Context<Initialize>,
    ) -> Result<()> {
        // Initialize the registry with an empty vector of tracker names
        ctx.accounts.tracker_registry.set_inner(TrackerRegistry::default());
        
        Ok(())
    }

    // Create a new tracker (any user can do this)
    pub fn create_tracker(
        ctx: Context<CreateTracker>,
        title: String,
        description: String,
    ) -> Result<()> {
        // Create a new tracker with the provided title and description
        let tracker = Tracker {
            id: ctx.accounts.tracker.key().to_bytes()[0] as u32, // Use first byte of PDA as ID
            title: title.clone(),
            description,
        };
        
        // Store the tracker in the PDA
        ctx.accounts.tracker.set_inner(tracker.clone());
        
        // Add the tracker name to the registry
        ctx.accounts.tracker_registry.tracker_names.push(title);
        
        Ok(())
    }

    // Add tracking data for a user
    pub fn add_tracking_data(
        ctx: Context<AddTrackingData>,
        tracker_id: u32,
        count: u32,
        date: u64,
    ) -> Result<()> {
        // Verify the tracker exists and matches the ID
        require!(
            ctx.accounts.tracker.id == tracker_id,
            TrackingError::InvalidTrackerId
        );

        let tracking_data = &mut ctx.accounts.tracking_data;
        let is_new_user = tracking_data.user == Pubkey::default();
        
        // Set the user field if this is a new account
        if is_new_user {
            tracking_data.user = ctx.accounts.user.key();
            tracking_data.tracker_id = tracker_id;
        }
        
        // Normalize date to midnight GMT (00:00:00)
        let normalized_date = (date / 86400) * 86400;
        
        // Check if we already have an entry for this date
        let existing_index = tracking_data.tracks.iter().position(|t| t.date == normalized_date);
        
        if let Some(index) = existing_index {
            // Update existing entry
            tracking_data.tracks[index].count = count;
        } else {
            // Add new entry
            let track = Track {
                date: normalized_date,
                count,
            };
            tracking_data.tracks.push(track);
            // Sort tracks by date in descending order
            tracking_data.tracks.sort_by(|a, b| b.date.cmp(&a.date));
        }

        // Update tracker stats for today
        let tracker_stats = &mut ctx.accounts.tracker_stats;
        if tracker_stats.tracker_id == 0 && tracker_stats.date == 0 {
            // Initialize the account if it's new
            tracker_stats.tracker_id = tracker_id;
            tracker_stats.date = normalized_date;
            tracker_stats.total_count = count;
            tracker_stats.unique_users = 1;
        } else {
            // Update existing account
            if tracker_stats.date != normalized_date {
                // Reset stats for new date
                tracker_stats.date = normalized_date;
                tracker_stats.total_count = count;
                tracker_stats.unique_users = 1;
            } else {
                // Update stats for existing date
                if let Some(index) = existing_index {
                    // If updating an existing entry, subtract the old count and add the new count
                    tracker_stats.total_count = tracker_stats.total_count - tracking_data.tracks[index].count + count;
                } else {
                    // If adding a new entry, just add the count
                    tracker_stats.total_count += count;
                    if is_new_user {
                        tracker_stats.unique_users += 1;
                    }
                }
            }
        }

        Ok(())
    }

    // View function to get all tracker names
    pub fn get_all_trackers(ctx: Context<GetAllTrackers>) -> Result<Vec<String>> {
        Ok(ctx.accounts.tracker_registry.tracker_names.clone())
    }

    // View function to get user tracking data for a specific tracker
    pub fn get_user_tracking_data(
        ctx: Context<GetUserTrackingData>,
        tracker_id: u32,
    ) -> Result<Vec<Track>> {
        require!(
            ctx.accounts.tracking_data.tracker_id == tracker_id,
            TrackingError::InvalidTrackerId
        );
        
        Ok(ctx.accounts.tracking_data.tracks.clone())
    }

    // View function to get total count and users for a tracker on a specific date
    pub fn get_tracker_stats(
        ctx: Context<GetTrackerStats>,
        tracker_id: u32,
        date: u64,
    ) -> Result<TrackerStats> {
        require!(
            ctx.accounts.tracker_stats.tracker_id == tracker_id,
            TrackingError::InvalidTrackerId
        );

        // Normalize date to midnight GMT (00:00:00)
        let normalized_date = (date / 86400) * 86400;

        let tracker_stats = &ctx.accounts.tracker_stats;
        require!(
            tracker_stats.date == normalized_date,
            TrackingError::InvalidTrackerId
        );

        // Return zero stats if the account hasn't been initialized
        if tracker_stats.tracker_id == 0 && tracker_stats.date == 0 {
            return Ok(TrackerStats {
                total_count: 0,
                unique_users: 0,
            });
        }

        Ok(TrackerStats {
            total_count: tracker_stats.total_count,
            unique_users: tracker_stats.unique_users,
        })
    }

    // View function to get current streak for a user and tracker
    pub fn get_user_streak(
        ctx: Context<GetUserStreak>,
        tracker_id: u32,
    ) -> Result<u32> {
        require!(
            ctx.accounts.tracking_data.tracker_id == tracker_id,
            TrackingError::InvalidTrackerId
        );

        let tracking_data = &ctx.accounts.tracking_data;
        let mut current_streak = 0;
        let one_day = 86400; // 24 hours in seconds
        
        // Get current date and normalize to midnight GMT
        let current_date = (Clock::get()?.unix_timestamp as u64 / one_day) * one_day;
        
        // Sort tracks by date in descending order
        let mut sorted_tracks = tracking_data.tracks.clone();
        sorted_tracks.sort_by(|a, b| b.date.cmp(&a.date));

        // Find the most recent date that is not in the future
        let mut most_recent_date = None;
        for track in sorted_tracks.iter() {
            if track.date <= current_date {
                most_recent_date = Some(track.date);
                break;
            }
        }

        // If no valid dates found, return 0
        let most_recent_date = match most_recent_date {
            Some(date) => date,
            None => return Ok(0),
        };

        // If the most recent date is not today or yesterday, return 1
        if most_recent_date < current_date - one_day {
            return Ok(1);
        }

        // Count consecutive days from the most recent date
        let mut expected_date = most_recent_date;
        let mut dates = Vec::new();
        for track in sorted_tracks.iter() {
            if track.date <= current_date {
                dates.push(track.date);
            }
        }
        dates.sort_by(|a, b| b.cmp(a));

        // Count consecutive days
        for date in dates {
            if date == expected_date {
                current_streak += 1;
                expected_date -= one_day;
            } else if date < expected_date - one_day {
                // If there's a gap of more than one day, break the streak
                break;
            }
        }

        Ok(current_streak)
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + TrackerRegistry::LEN,
        seeds = [b"tracker_registry"],
        bump
    )]
    pub tracker_registry: Account<'info, TrackerRegistry>,
    
    /// CHECK: This is the user who is initializing the registry
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(title: String)]
pub struct CreateTracker<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + Tracker::LEN,
        seeds = [b"tracker", title.as_bytes()],
        bump
    )]
    pub tracker: Account<'info, Tracker>,
    
    #[account(
        mut,
        seeds = [b"tracker_registry"],
        bump
    )]
    pub tracker_registry: Account<'info, TrackerRegistry>,
    
    /// CHECK: This is the user who is creating the tracker
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(tracker_id: u32, count: u32, date: u64)]
pub struct AddTrackingData<'info> {
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + TrackingData::LEN,
        seeds = [b"tracking_data", user.key().as_ref(), &[tracker_id as u8; 13]],
        bump
    )]
    pub tracking_data: Account<'info, TrackingData>,
    
    #[account(
        seeds = [b"tracker", tracker.title.as_bytes()],
        bump
    )]
    pub tracker: Account<'info, Tracker>,
    
    /// CHECK: This is the user who is adding tracking data
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + TrackerStatsAccount::LEN,
        seeds = [
            b"tracker_stats",
            &[tracker_id as u8; 13],
            &[((date / 86400) * 86400) as u8; 13],
        ],
        bump
    )]
    pub tracker_stats: Account<'info, TrackerStatsAccount>,
}

#[derive(Accounts)]
pub struct GetAllTrackers<'info> {
    #[account(
        seeds = [b"tracker_registry"],
        bump
    )]
    pub tracker_registry: Account<'info, TrackerRegistry>,
}

#[derive(Accounts)]
#[instruction(tracker_id: u32)]
pub struct GetUserTrackingData<'info> {
    #[account(
        seeds = [b"tracking_data", user.key().as_ref(), &[tracker_id as u8; 13]],
        bump
    )]
    pub tracking_data: Account<'info, TrackingData>,
    /// CHECK: This is the user whose tracking data we're retrieving
    pub user: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(tracker_id: u32, date: u64)]
pub struct GetTrackerStats<'info> {
    #[account(
        seeds = [
            b"tracker_stats",
            &[tracker_id as u8; 13],
            &[((date / 86400) * 86400) as u8; 13],
        ],
        bump
    )]
    pub tracker_stats: Account<'info, TrackerStatsAccount>,
    #[account(
        seeds = [b"tracker", tracker.title.as_bytes()],
        bump
    )]
    pub tracker: Account<'info, Tracker>,
}

#[derive(Accounts)]
#[instruction(tracker_id: u32)]
pub struct GetUserStreak<'info> {
    #[account(
        seeds = [b"tracking_data", user.key().as_ref(), &[tracker_id as u8; 13]],
        bump
    )]
    pub tracking_data: Account<'info, TrackingData>,
    /// CHECK: This is the user whose streak we're calculating
    pub user: AccountInfo<'info>,
}

#[account]
pub struct TrackingData {
    pub user: Pubkey,
    pub tracker_id: u32,
    pub tracks: Vec<Track>,
}

#[account]
pub struct Tracker {
    pub id: u32,
    pub title: String,
    pub description: String,
}

#[account]
pub struct TrackerRegistry {
    pub tracker_names: Vec<String>,
}

impl Default for TrackerRegistry {
    fn default() -> Self {
        Self {
            tracker_names: Vec::new(),
        }
    }
}

impl TrackerRegistry {
    pub const LEN: usize = 4 + // tracker_names vector length
        (4 + 32) * 100; // space for 100 tracker names initially (each name max 32 chars)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Track {
    pub date: u64,
    pub count: u32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TrackerStats {
    pub total_count: u32,
    pub unique_users: u32,
}

#[account]
pub struct TrackerStatsAccount {
    pub tracker_id: u32,
    pub date: u64,
    pub total_count: u32,
    pub unique_users: u32,
}

#[error_code]
pub enum TrackingError {
    #[msg("Invalid tracker ID")]
    InvalidTrackerId,
}

impl TrackingData {
    pub const LEN: usize = 32 + // user
        4 + // tracker_id
        4 + // tracks vector length
        (8 + 4) * 100; // space for 100 tracks initially
}

impl Tracker {
    pub const LEN: usize = 4 + // id
        4 + // title length
        32 + // title (max 32 chars)
        4 + // description length
        100; // description (max 100 chars)
}

impl TrackerStatsAccount {
    pub const LEN: usize = 4 + 8 + 4 + 4; // tracker_id (u32) + date (u64) + total_count (u32) + unique_users (u32)
}
