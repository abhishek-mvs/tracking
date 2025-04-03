use anchor_lang::prelude::*;

declare_id!("FfjNyygvYw56Qaq1MUj34U3nMb3uVb5NjCUjjRzMashR");

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
        
        if let Some(_) = existing_index {
            // Return error if entry for this date already exists
            return err!(TrackingError::TrackingDataAlreadyExists);
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
        let tracker_stats_list = &mut ctx.accounts.tracker_stats_list;
        
        // Initialize tracker_stats_list if needed
        if tracker_stats_list.tracker_id == 0 {
            tracker_stats_list.tracker_id = tracker_id;
        }

        if tracker_stats.tracker_id == 0 && tracker_stats.date == 0 {
            // Initialize the account if it's new
            tracker_stats.tracker_id = tracker_id;
            tracker_stats.date = normalized_date;
            tracker_stats.total_count = count;
            tracker_stats.unique_users = 1;
            
            // Add the date to the list if it's not already there
            if !tracker_stats_list.stats.iter().any(|s| s.date == normalized_date) {
                tracker_stats_list.stats.push(TrackerStatsAccount {
                    tracker_id,
                    date: normalized_date,
                    total_count: count,
                    unique_users: 1,
                });
            }
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
                    tracker_stats.unique_users += 1;
                    
                }
            }
            
            // Update stats in tracker_stats_list
            if let Some(stats_entry) = tracker_stats_list.stats.iter_mut().find(|s| s.date == normalized_date) {
                stats_entry.total_count = tracker_stats.total_count;
                stats_entry.unique_users = tracker_stats.unique_users;
            } else {
                // If entry doesn't exist, add it
                tracker_stats_list.stats.push(TrackerStatsAccount {
                    tracker_id,
                    date: normalized_date,
                    total_count: tracker_stats.total_count,
                    unique_users: tracker_stats.unique_users,
                });
            }
        }

        // Update streak information
        let tracker_streak = &mut ctx.accounts.tracker_streak;
        let one_day = 86400; // 24 hours in seconds

        if tracker_streak.user == Pubkey::default() {
            // Initialize streak account for new user
            tracker_streak.user = ctx.accounts.user.key();
            tracker_streak.tracker_id = tracker_id;
            tracker_streak.streak = 1;
            tracker_streak.last_streak_date = normalized_date;
            tracker_streak.longest_streak = 1;
            tracker_streak.longest_streak_date = normalized_date;
        } else {
            // Update existing streak
            let last_date = tracker_streak.last_streak_date;
            
            if normalized_date == last_date {
                // Same day, no streak change
                return Ok(());
            }

            if normalized_date == last_date + one_day  && count > 0{
                // Next day, increment streak
                tracker_streak.streak += 1;
                if tracker_streak.streak > tracker_streak.longest_streak {
                    tracker_streak.longest_streak = tracker_streak.streak;
                    tracker_streak.longest_streak_date = normalized_date;
                }
            } else if normalized_date > last_date + one_day {
                tracker_streak.streak = 1;
            } else if count == 0 {
               tracker_streak.streak = 0;
            }
            
            tracker_streak.last_streak_date = normalized_date;
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
    ) -> Result<TrackerStreakAccount> {
        require!(
            ctx.accounts.tracker_streak.tracker_id == tracker_id,
            TrackingError::InvalidTrackerId
        );

        let streak_account = TrackerStreakAccount {
            tracker_id: ctx.accounts.tracker_streak.tracker_id,
            user: ctx.accounts.tracker_streak.user,
            streak: ctx.accounts.tracker_streak.streak,
            last_streak_date: ctx.accounts.tracker_streak.last_streak_date,
            longest_streak: ctx.accounts.tracker_streak.longest_streak,
            longest_streak_date: ctx.accounts.tracker_streak.longest_streak_date,
        };
        Ok(streak_account)
    }

    // View function to get all dates and their corresponding stats PDAs for a tracker
    pub fn get_all_tracker_stats(
        ctx: Context<GetAllTrackerStats>,
        tracker_id: u32,
    ) -> Result<Vec<TrackerStatsAccount>> {
        require!(
            ctx.accounts.tracker_stats_list.tracker_id == tracker_id,
            TrackingError::InvalidTrackerId
        );

        Ok(ctx.accounts.tracker_stats_list.stats.clone())
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

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + TrackerStatsList::LEN,
        seeds = [b"tracker_stats_list", &[tracker_id as u8; 18]],
        bump
    )]
    pub tracker_stats_list: Account<'info, TrackerStatsList>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + TrackerStreakAccount::LEN,
        seeds = [b"tracker_streak", user.key().as_ref(), &[tracker_id as u8; 13]],
        bump
    )]
    pub tracker_streak: Account<'info, TrackerStreakAccount>,
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
        seeds = [b"tracker_streak", user.key().as_ref(), &[tracker_id as u8; 13]],
        bump
    )]
    pub tracker_streak: Account<'info, TrackerStreakAccount>,
    /// CHECK: This is the user whose streak we're retrieving
    pub user: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(tracker_id: u32)]
pub struct GetAllTrackerStats<'info> {
    #[account(
        seeds = [b"tracker_stats_list", &[tracker_id as u8; 18]],
        bump
    )]
    pub tracker_stats_list: Account<'info, TrackerStatsList>,
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

#[account]
pub struct TrackerStreakAccount {
    pub user: Pubkey,
    pub tracker_id: u32,
    pub streak: u32,
    pub last_streak_date: u64,
    pub longest_streak: u32,
    pub longest_streak_date: u64,
}

#[account]
pub struct TrackerStatsList {
    pub tracker_id: u32,
    pub stats: Vec<TrackerStatsAccount>,  // List of dates for which we have stats
}


impl TrackerStatsList {
    pub const LEN: usize = 4 + // tracker_id
        4 + // stats_dates vector length
        8 * 100; // space for 100 dates initially
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TrackerStatsDateInfo {
    pub date: u64,
    pub stats_pda: Pubkey,
}

#[error_code]
pub enum TrackingError {
    #[msg("Invalid tracker ID")]
    InvalidTrackerId,
    #[msg("Tracking data already exists for this date")]
    TrackingDataAlreadyExists,
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

impl TrackerStreakAccount {
    pub const LEN: usize = 32 + // user (Pubkey)
        4 + // tracker_id (u32)
        4 + // streak (u32)
        8 + // last_streak_date (u64)
        4 + // longest_streak (u32)
        8; // longest_streak_date (u64)
}
