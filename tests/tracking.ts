import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TrackingSystem } from "../target/types/tracking_system";
import { expect } from 'chai';
import { PublicKey } from '@solana/web3.js';

// Helper function to generate random tracker names
function generateRandomTrackerName(): string {
  return `Tracker_${Math.random().toString(36).substring(2, 8)}`;
}

describe("tracking", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TrackingSystem as Program<TrackingSystem>;
  
  // Derive tracker registry PDA
  const [trackerRegistryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("tracker_registry")],
    program.programId
  );

  it("Initializes the tracker registry", async () => {
    await program.methods
      .initialize()
      .accounts({
        trackerRegistry: trackerRegistryPda,
        user: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const registry = await program.account.trackerRegistry.fetch(trackerRegistryPda);
    expect(registry.trackerNames).to.have.lengthOf(0);
  });

  it("Creates a new tracker", async () => {
    const title = "No Smoking";
    const description = "Track your no smoking streak";

    const titleFitness = "Fitness"
    const descriptionFitness = "Track your fitness streak"
    // Derive the tracker PDA
    const [trackerPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tracker"), Buffer.from(title)],
      program.programId
    );

    await program.methods
      .createTracker(title, description)
      .accounts({
        tracker: trackerPda,
        trackerRegistry: trackerRegistryPda,
        user: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const tracker = await program.account.tracker.fetch(trackerPda);
    expect(tracker.title).to.equal(title);
    expect(tracker.description).to.equal(description);
    expect(tracker.id).to.equal(trackerPda.toBytes()[0]);
    console.log("tracker", tracker);
    const [trackerPdaFitness] = PublicKey.findProgramAddressSync(
      [Buffer.from("tracker"), Buffer.from(titleFitness)],
      program.programId
    );

    await program.methods
      .createTracker(titleFitness, descriptionFitness)
      .accounts({
        tracker: trackerPdaFitness,
        trackerRegistry: trackerRegistryPda,
        user: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const trackerFitness = await program.account.tracker.fetch(trackerPdaFitness);
    expect(trackerFitness.title).to.equal(titleFitness);
    expect(trackerFitness.description).to.equal(descriptionFitness);
    expect(trackerFitness.id).to.equal(trackerPdaFitness.toBytes()[0]);

  });

  it("Gets list of tracker names", async () => {
    const trackerNames = await program.methods
      .getAllTrackers()
      .accounts({
        trackerRegistry: trackerRegistryPda,
      })
      .view();

    expect(trackerNames).to.have.lengthOf(2);
    expect(trackerNames[0]).to.equal("No Smoking");
  });

  it("Gets list of tracker names for a different user", async () => {
    // Create a new wallet for testing
    const otherWallet = anchor.web3.Keypair.generate();

    // Create a new provider with the other wallet
    const otherProvider = new anchor.AnchorProvider(
      provider.connection,
      new anchor.Wallet(otherWallet),
      provider.opts
    );

    // Set the provider to the other wallet
    anchor.setProvider(otherProvider);
    
    // Use the same program instance but with the new provider
    const trackerNames = await program.methods
      .getAllTrackers()
      .accounts({
        trackerRegistry: trackerRegistryPda,
      })
      .view();

    // Tracker names should be the same regardless of wallet
    expect(trackerNames).to.have.lengthOf(2);
    expect(trackerNames[0]).to.equal("No Smoking");
    
    // Reset the provider back to the original
    anchor.setProvider(provider);
  });

  // it("Adds tracking data for a user", async () => {
  //   const title = "No Smoking";
  //   const [trackerPda] = PublicKey.findProgramAddressSync(
  //     [Buffer.from("tracker"), Buffer.from(title)],
  //     program.programId
  //   );
    
  //   const tracker = await program.account.tracker.fetch(trackerPda);
  //   const trackerId = tracker.id;
    
  //   const count = 5;
  //   const date = Math.floor(Date.now() / 1000); // Current Unix timestamp
  //   const normalizedDate = Math.floor(date / 86400) * 86400;

  //   // Derive the tracking data PDA
  //   const [trackingDataPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracking_data"),
  //       provider.wallet.publicKey.toBuffer(),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   // Derive the tracker stats PDA
  //   const [trackerStatsPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_stats"),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //       new Uint8Array(new Array(13).fill(normalizedDate)),
  //     ],
  //     program.programId
  //   );

  //   // Derive the tracker streak PDA
  //   const [trackerStreakPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_streak"),
  //       provider.wallet.publicKey.toBuffer(),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   const [trackerStatsListPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_stats_list"),
  //       new Uint8Array(new Array(18).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   await program.methods
  //     .addTrackingData(trackerId, count, new anchor.BN(date))
  //     .accounts({
  //       trackingData: trackingDataPda,
  //       tracker: trackerPda,
  //       user: provider.wallet.publicKey,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //       trackerStats: trackerStatsPda,
  //       trackerStreak: trackerStreakPda,
  //       trackerStatsList: trackerStatsListPda,
  //     })
  //     .rpc();

  //   const trackingData = await program.account.trackingData.fetch(trackingDataPda);
  //   expect(trackingData.user).to.eql(provider.wallet.publicKey);
  //   expect(trackingData.trackerId).to.equal(trackerId);
  //   expect(trackingData.tracks).to.have.lengthOf(1);
  //   expect(trackingData.tracks[0].count).to.equal(count);
  //   expect(trackingData.tracks[0].date.toNumber()).to.equal(normalizedDate);

  //   // Verify streak data
  //   const trackerStreak = await program.account.trackerStreakAccount.fetch(trackerStreakPda);
  //   expect(trackerStreak.user).to.eql(provider.wallet.publicKey);
  //   expect(trackerStreak.trackerId).to.equal(trackerId);
  //   expect(trackerStreak.streak).to.equal(1);
  //   expect(trackerStreak.lastStreakDate.toNumber()).to.equal(normalizedDate);
  //   expect(trackerStreak.longestStreak).to.equal(1);
  //   expect(trackerStreak.longestStreakDate.toNumber()).to.equal(normalizedDate);
  // });

  // it("Gets user tracking data", async () => {
  //   const title = "No Smoking";
  //   const [trackerPda] = PublicKey.findProgramAddressSync(
  //     [Buffer.from("tracker"), Buffer.from(title)],
  //     program.programId
  //   );
    
  //   const tracker = await program.account.tracker.fetch(trackerPda);
  //   const trackerId = tracker.id;
    
  //   const [trackingDataPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracking_data"),
  //       provider.wallet.publicKey.toBuffer(),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   const tracks = await program.methods
  //     .getUserTrackingData(trackerId)
  //     .accounts({
  //       trackingData: trackingDataPda,
  //       user: provider.wallet.publicKey,
  //     })
  //     .view();

  //   expect(tracks).to.have.lengthOf(1);
  //   expect(tracks[0].count).to.equal(5);
  // });

  // it("Fails to add tracking data with invalid tracker ID", async () => {
  //   const invalidTrackerId = 999;
  //   const count = 5;
  //   const date = Math.floor(Date.now() / 1000);
  //   const normalizedDate = Math.floor(date / 86400) * 86400;
    
  //   // Derive a fake tracker PDA for the invalid ID
  //   const [fakeTrackerPda] = PublicKey.findProgramAddressSync(
  //     [Buffer.from("tracker"), Buffer.from("fake_tracker")],
  //     program.programId
  //   );
    
  //   const [trackingDataPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracking_data"),
  //       provider.wallet.publicKey.toBuffer(),
  //       new Uint8Array(new Array(13).fill(invalidTrackerId)),
  //     ],
  //     program.programId
  //   );

  //   const [trackerStatsPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_stats"),
  //       new Uint8Array(new Array(13).fill(invalidTrackerId)),
  //       new Uint8Array(new Array(13).fill(normalizedDate)),
  //     ],
  //     program.programId
  //   );

  //   const [trackerStreakPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_streak"),
  //       provider.wallet.publicKey.toBuffer(),
  //       new Uint8Array(new Array(13).fill(invalidTrackerId)),
  //     ],
  //     program.programId
  //   );

  //   const [trackerStatsListPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_stats_list"),
  //       new Uint8Array(new Array(18).fill(invalidTrackerId)),
  //     ],
  //     program.programId
  //   );

  //   try {
  //     await program.methods
  //       .addTrackingData(invalidTrackerId, count, new anchor.BN(date))
  //       .accounts({
  //         trackingData: trackingDataPda,
  //         tracker: fakeTrackerPda,
  //         user: provider.wallet.publicKey,
  //         systemProgram: anchor.web3.SystemProgram.programId,
  //         trackerStats: trackerStatsPda,
  //         trackerStreak: trackerStreakPda,
  //         trackerStatsList: trackerStatsListPda,
  //       })
  //       .rpc();
      
  //     expect.fail("Should have thrown an error");
  //   } catch (error) {
  //     console.log(error.message);
  //     expect(error).to.be.instanceOf(Error);
  //   }
  // });

  // it("Gets tracker stats for a specific date", async () => {
  //   const title = generateRandomTrackerName();
  //   const description = "Track your progress";
  //   console.log("title", title);
  //   // Create a new tracker
  //   const [trackerPda] = PublicKey.findProgramAddressSync(
  //     [Buffer.from("tracker"), Buffer.from(title)],
  //     program.programId
  //   );

  //   await program.methods
  //     .createTracker(title, description)
  //     .accounts({
  //       tracker: trackerPda,
  //       trackerRegistry: trackerRegistryPda,
  //       user: provider.wallet.publicKey,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //     })
  //     .rpc();
    
  //   const tracker = await program.account.tracker.fetch(trackerPda);
  //   const trackerId = tracker.id;
    
  //   const currentDate = Math.floor(Date.now() / 1000);
  //   const tenDays = 86400 * 10;
  //   const testDate = currentDate - tenDays;
  //   const normalizedTestDate = Math.floor(testDate / 86400) * 86400;
  //   const count = 5;

  //   // Create another wallet for testing
  //   const otherWallet = anchor.web3.Keypair.generate();
    
  //   // Airdrop SOL to the other wallet
  //   const airdropTx = await provider.connection.requestAirdrop(
  //     otherWallet.publicKey,
  //     10 * anchor.web3.LAMPORTS_PER_SOL
  //   );
  //   await provider.connection.confirmTransaction(airdropTx);

  //   const [trackingDataPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracking_data"),
  //       provider.wallet.publicKey.toBuffer(),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   const [trackerStreakPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_streak"),
  //       provider.wallet.publicKey.toBuffer(),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   const [trackerStatsPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_stats"),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //       new Uint8Array(new Array(13).fill(normalizedTestDate)),
  //     ],
  //     program.programId
  //   );

  //   const [trackerStatsListPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_stats_list"),
  //       new Uint8Array(new Array(18).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   // First user adds tracking data
  //   await program.methods
  //     .addTrackingData(trackerId, count, new anchor.BN(normalizedTestDate))
  //     .accounts({
  //       trackingData: trackingDataPda,
  //       tracker: trackerPda,
  //       user: provider.wallet.publicKey,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //       trackerStats: trackerStatsPda,
  //       trackerStreak: trackerStreakPda,
  //       trackerStatsList: trackerStatsListPda,
  //     })
  //     .rpc();

  //   const [otherTrackingDataPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracking_data"),
  //       otherWallet.publicKey.toBuffer(),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   const [otherTrackerStreakPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_streak"),
  //       otherWallet.publicKey.toBuffer(),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   // Second user adds tracking data
  //   await program.methods
  //     .addTrackingData(trackerId, count, new anchor.BN(normalizedTestDate))
  //     .accounts({
  //       trackingData: otherTrackingDataPda,
  //       tracker: trackerPda,
  //       user: otherWallet.publicKey,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //       trackerStats: trackerStatsPda,
  //       trackerStreak: otherTrackerStreakPda,
  //       trackerStatsList: trackerStatsListPda,
  //     })
  //     .signers([otherWallet])
  //     .rpc();

  //   // Get stats for the specific date using the view function
  //   const stats = await program.methods
  //     .getTrackerStats(trackerId, new anchor.BN(normalizedTestDate))
  //     .accounts({
  //       trackerStats: trackerStatsPda,
  //       tracker: trackerPda,
  //     })
  //     .view();

  //   expect(stats.totalCount).to.equal(count * 2);
  //   expect(stats.uniqueUsers).to.equal(2);
  // });

  // it("Gets user streak", async () => {
  //   const title = generateRandomTrackerName();
  //   const description = "Track your streak";
  //   console.log("title", title);
  //   // Create a new tracker
  //   const [trackerPda] = PublicKey.findProgramAddressSync(
  //     [Buffer.from("tracker"), Buffer.from(title)],
  //     program.programId
  //   );

  //   await program.methods
  //     .createTracker(title, description)
  //     .accounts({
  //       tracker: trackerPda,
  //       trackerRegistry: trackerRegistryPda,
  //       user: provider.wallet.publicKey,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //     })
  //     .rpc();
    
  //   const tracker = await program.account.tracker.fetch(trackerPda);
  //   const trackerId = tracker.id;
    
  //   const currentDate = Math.floor(Date.now() / 1000);
  //   const oneDay = 86400;
  //   // Normalize to UTC midnight
  //   const normalizedCurrentDate = Math.floor(currentDate / oneDay) * oneDay;
  //   const normalizedYesterday = normalizedCurrentDate - oneDay;
  //   const count = 5;

  //   // Derive PDAs
  //   const [trackingDataPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracking_data"),
  //       provider.wallet.publicKey.toBuffer(),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   const [trackerStreakPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_streak"),
  //       provider.wallet.publicKey.toBuffer(),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   const [yesterdayTrackerStatsPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_stats"),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //       new Uint8Array(new Array(13).fill(normalizedYesterday)),
  //     ],
  //     program.programId
  //   );

  //   const [trackerStatsListPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_stats_list"),
  //       new Uint8Array(new Array(18).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   // Add yesterday's tracking data first
  //   await program.methods
  //     .addTrackingData(trackerId, count, new anchor.BN(normalizedYesterday))
  //     .accounts({
  //       trackingData: trackingDataPda,
  //       tracker: trackerPda,
  //       user: provider.wallet.publicKey,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //       trackerStats: yesterdayTrackerStatsPda,
  //       trackerStreak: trackerStreakPda,
  //       trackerStatsList: trackerStatsListPda,
  //     })
  //     .rpc();

  //   const [currentTrackerStatsPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_stats"),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //       new Uint8Array(new Array(13).fill(normalizedCurrentDate)),
  //     ],
  //     program.programId
  //   );

  //   // Add today's tracking data
  //   await program.methods
  //     .addTrackingData(trackerId, count, new anchor.BN(normalizedCurrentDate))
  //     .accounts({
  //       trackingData: trackingDataPda,
  //       tracker: trackerPda,
  //       user: provider.wallet.publicKey,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //       trackerStats: currentTrackerStatsPda,
  //       trackerStreak: trackerStreakPda,
  //       trackerStatsList: trackerStatsListPda,
  //     })
  //     .rpc();

  //   // Get streak
  //   const streak = await program.methods
  //     .getUserStreak(trackerId)
  //     .accounts({
  //       trackerStreak: trackerStreakPda,
  //       user: provider.wallet.publicKey,
  //     })
  //     .view();

  //   expect(streak.streak).to.equal(2);
  //   expect(streak.user).to.eql(provider.wallet.publicKey);
  //   expect(streak.trackerId).to.equal(trackerId);
  //   expect(streak.lastStreakDate.toNumber()).to.equal(normalizedCurrentDate);
  //   expect(streak.longestStreak).to.equal(2);
  //   expect(streak.longestStreakDate.toNumber()).to.equal(normalizedCurrentDate);
  // });

  // it("Breaks streak when there's a gap", async () => {
  //   const title = generateRandomTrackerName();
  //   console.log("title", title);
  //   const description = "Track your streak with gaps";
    
  //   // Create a new tracker
  //   const [trackerPda] = PublicKey.findProgramAddressSync(
  //     [Buffer.from("tracker"), Buffer.from(title)],
  //     program.programId
  //   );

  //   await program.methods
  //     .createTracker(title, description)
  //     .accounts({
  //       tracker: trackerPda,
  //       trackerRegistry: trackerRegistryPda,
  //       user: provider.wallet.publicKey,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //     })
  //     .rpc();
    
  //   const tracker = await program.account.tracker.fetch(trackerPda);
  //   const trackerId = tracker.id;
    
  //   const currentDate = Math.floor(Date.now() / 1000);
  //   const twoDays = 86400 * 2;
  //   const normalizedCurrentDate = Math.floor(currentDate / 86400) * 86400;
  //   const normalizedTwoDaysAfter = normalizedCurrentDate + twoDays;
  //   const count = 5;

  //   // Derive PDAs
  //   const [trackingDataPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracking_data"),
  //       provider.wallet.publicKey.toBuffer(),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   const [trackerStreakPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_streak"),
  //       provider.wallet.publicKey.toBuffer(),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   const [currentTrackerStatsPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_stats"),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //       new Uint8Array(new Array(13).fill(normalizedCurrentDate)),
  //     ],
  //     program.programId
  //   );

  //   // Add tracking data from two days ago first
  //   const [twoDaysAgoTrackerStatsPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_stats"),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //       new Uint8Array(new Array(13).fill(normalizedTwoDaysAfter)),
  //     ],
  //     program.programId
  //   );

  //   const [trackerStatsListPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_stats_list"),
  //       new Uint8Array(new Array(18).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   // First add data from two days ago
  //   await program.methods
  //     .addTrackingData(trackerId, count, new anchor.BN(normalizedTwoDaysAfter))
  //     .accounts({
  //       trackingData: trackingDataPda,
  //       tracker: trackerPda,
  //       user: provider.wallet.publicKey,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //       trackerStats: twoDaysAgoTrackerStatsPda,
  //       trackerStreak: trackerStreakPda,
  //       trackerStatsList: trackerStatsListPda,
  //     })
  //     .rpc();

  //   // Verify initial streak
  //   let streak = await program.methods
  //     .getUserStreak(trackerId)
  //     .accounts({
  //       trackerStreak: trackerStreakPda,
  //       user: provider.wallet.publicKey,
  //     })
  //     .view();
  //   expect(streak.streak).to.equal(1);
  //   expect(streak.lastStreakDate.toNumber()).to.equal(normalizedTwoDaysAfter);

  //   // Then add today's tracking data (creating a gap)
  //   await program.methods
  //     .addTrackingData(trackerId, count, new anchor.BN(normalizedCurrentDate))
  //     .accounts({
  //       trackingData: trackingDataPda,
  //       tracker: trackerPda,
  //       user: provider.wallet.publicKey,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //       trackerStats: currentTrackerStatsPda,
  //       trackerStreak: trackerStreakPda,
  //       trackerStatsList: trackerStatsListPda,
  //     })
  //     .rpc();

  //   // Verify streak is reset to 1 due to the gap
  //   streak = await program.methods
  //     .getUserStreak(trackerId)
  //     .accounts({
  //       trackerStreak: trackerStreakPda,
  //       user: provider.wallet.publicKey,
  //     })
  //     .view();
    
  //   expect(streak.streak).to.equal(1);
  //   expect(streak.lastStreakDate.toNumber()).to.equal(normalizedCurrentDate);
  //   expect(streak.longestStreak).to.equal(1);
  //   expect(streak.longestStreakDate.toNumber()).to.equal(normalizedTwoDaysAfter);
  // });

  // it("Gets all tracker stats", async () => {
  //   const title = generateRandomTrackerName();
  //   const description = "Track your progress over time";

  //   // Derive the tracker PDA
  //   const [trackerPda] = PublicKey.findProgramAddressSync(
  //     [Buffer.from("tracker"), Buffer.from(title)],
  //     program.programId
  //   );

  //   await program.methods
  //     .createTracker(title, description)
  //     .accounts({
  //       tracker: trackerPda,
  //       trackerRegistry: trackerRegistryPda,
  //       user: provider.wallet.publicKey,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //     })
  //     .rpc();

  //   const tracker = await program.account.tracker.fetch(trackerPda);
  //   const trackerId = tracker.id;
    
  //   const currentDate = Math.floor(Date.now() / 1000);
  //   const oneDay = 86400;
  //   // Normalize to UTC midnight
  //   const normalizedCurrentDate = Math.floor(currentDate / oneDay) * oneDay;
  //   const normalizedYesterday = normalizedCurrentDate - oneDay;
  //   const count = 5;

  //   // Derive PDAs
  //   const [trackingDataPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracking_data"),
  //       provider.wallet.publicKey.toBuffer(),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   const [trackerStreakPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_streak"),
  //       provider.wallet.publicKey.toBuffer(),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   const [yesterdayTrackerStatsPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_stats"),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //       new Uint8Array(new Array(13).fill(normalizedYesterday)),
  //     ],
  //     program.programId
  //   );

  //   const [currentTrackerStatsPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_stats"),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //       new Uint8Array(new Array(13).fill(normalizedCurrentDate)),
  //     ],
  //     program.programId
  //   );

  //   const [trackerStatsListPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_stats_list"),
  //       new Uint8Array(new Array(18).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   // Add tracking data for yesterday
  //   await program.methods
  //     .addTrackingData(trackerId, count, new anchor.BN(normalizedYesterday))
  //     .accounts({
  //       trackingData: trackingDataPda,
  //       tracker: trackerPda,
  //       user: provider.wallet.publicKey,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //       trackerStats: yesterdayTrackerStatsPda,
  //       trackerStreak: trackerStreakPda,
  //       trackerStatsList: trackerStatsListPda,
  //     })
  //     .rpc();

  //   // Add tracking data for today
  //   await program.methods
  //     .addTrackingData(trackerId, count, new anchor.BN(normalizedCurrentDate))
  //     .accounts({
  //       trackingData: trackingDataPda,
  //       tracker: trackerPda,
  //       user: provider.wallet.publicKey,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //       trackerStats: currentTrackerStatsPda,
  //       trackerStreak: trackerStreakPda,
  //       trackerStatsList: trackerStatsListPda,
  //     })
  //     .rpc();

  //   // Get all tracker stats
  //   const stats = await program.methods
  //     .getAllTrackerStats(trackerId)
  //     .accounts({
  //       trackerStatsList: trackerStatsListPda,
  //     })
  //     .view();

  //   // Verify the results
  //   expect(stats).to.have.lengthOf(2);
    
  //   // Sort stats by date to ensure consistent order
  //   stats.sort((a, b) => a.date.toNumber() - b.date.toNumber());
    
  //   // Verify yesterday's data
  //   expect(stats[0].date.toNumber()).to.equal(normalizedYesterday);
  //   expect(stats[0].trackerId).to.equal(trackerId);
  //   expect(stats[0].totalCount).to.equal(count);
  //   expect(stats[0].uniqueUsers).to.equal(1);
    
  //   // Verify today's data
  //   expect(stats[1].date.toNumber()).to.equal(normalizedCurrentDate);
  //   expect(stats[1].trackerId).to.equal(trackerId);
  //   expect(stats[1].totalCount).to.equal(count);
  //   expect(stats[1].uniqueUsers).to.equal(1);
  // });

  // it("Fails to add tracking data for the same day twice", async () => {
  //   const title = generateRandomTrackerName();
  //   const description = "Test duplicate tracking data";
    
  //   // Create a new tracker
  //   const [trackerPda] = PublicKey.findProgramAddressSync(
  //     [Buffer.from("tracker"), Buffer.from(title)],
  //     program.programId
  //   );

  //   await program.methods
  //     .createTracker(title, description)
  //     .accounts({
  //       tracker: trackerPda,
  //       trackerRegistry: trackerRegistryPda,
  //       user: provider.wallet.publicKey,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //     })
  //     .rpc();
    
  //   const tracker = await program.account.tracker.fetch(trackerPda);
  //   const trackerId = tracker.id;
    
  //   const currentDate = Math.floor(Date.now() / 1000);
  //   const normalizedDate = Math.floor(currentDate / 86400) * 86400;
  //   const count = 5;

  //   // Derive PDAs
  //   const [trackingDataPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracking_data"),
  //       provider.wallet.publicKey.toBuffer(),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   const [trackerStreakPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_streak"),
  //       provider.wallet.publicKey.toBuffer(),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   const [trackerStatsPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_stats"),
  //       new Uint8Array(new Array(13).fill(trackerId)),
  //       new Uint8Array(new Array(13).fill(normalizedDate)),
  //     ],
  //     program.programId
  //   );

  //   const [trackerStatsListPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("tracker_stats_list"),
  //       new Uint8Array(new Array(18).fill(trackerId)),
  //     ],
  //     program.programId
  //   );

  //   // First add tracking data
  //   await program.methods
  //     .addTrackingData(trackerId, count, new anchor.BN(normalizedDate))
  //     .accounts({
  //       trackingData: trackingDataPda,
  //       tracker: trackerPda,
  //       user: provider.wallet.publicKey,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //       trackerStats: trackerStatsPda,
  //       trackerStreak: trackerStreakPda,
  //       trackerStatsList: trackerStatsListPda,
  //     })
  //     .rpc();

  //   // Try to add tracking data for the same day again
  //   try {
  //     await program.methods
  //       .addTrackingData(trackerId, count + 1, new anchor.BN(normalizedDate))
  //       .accounts({
  //         trackingData: trackingDataPda,
  //         tracker: trackerPda,
  //         user: provider.wallet.publicKey,
  //         systemProgram: anchor.web3.SystemProgram.programId,
  //         trackerStats: trackerStatsPda,
  //         trackerStreak: trackerStreakPda,
  //         trackerStatsList: trackerStatsListPda,
  //       })
  //       .rpc();
      
  //     expect.fail("Should have thrown an error");
  //   } catch (error) {
  //     expect(error.message).to.include("Tracking data already exists");
  //   }
  // });
});
