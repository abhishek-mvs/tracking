import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TrackingSystem } from "../target/types/tracking_system";
import { expect } from 'chai';
import { PublicKey } from '@solana/web3.js';

describe("tracking", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TrackingSystem as Program<TrackingSystem>;
  
  // Derive program state PDA
  const [programStatePda] = PublicKey.findProgramAddressSync(
    [new Uint8Array([112, 114, 111, 103, 114, 97, 109, 95, 115, 116, 97, 116, 101])], // "program_state" in bytes
    program.programId
  );

  it("Initializes the program state", async () => {
    const tx = await program.methods
      .initialize()
      .accounts({
        programState: programStatePda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("tx", tx);
    const programState = await program.account.programState.fetch(programStatePda);
    expect(programState.authority).to.eql(provider.wallet.publicKey);
    expect(programState.trackers).to.be.an('array').that.is.empty;
  });

  it("Creates a new tracker", async () => {
    const title = "No Smoking";
    const description = "Track your no smoking streak";

    const tx = await program.methods
      .createTracker(title, description)
      .accounts({
        programState: programStatePda,
        authority: provider.wallet.publicKey,
      })
      .rpc();

    const programState = await program.account.programState.fetch(programStatePda);
    expect(programState.trackers).to.have.lengthOf(1);
    expect(programState.trackers[0].title).to.equal(title);
    expect(programState.trackers[0].description).to.equal(description);
    expect(programState.trackers[0].id).to.equal(0);
  });

  it("Gets list of trackers", async () => {
    const trackers = await program.methods
      .getTrackers()
      .accounts({
        programState: programStatePda,
      })
      .view();

    expect(trackers).to.have.lengthOf(1);
    expect(trackers[0].title).to.equal("No Smoking");
  });

  it("Adds tracking data for a user", async () => {
    const trackerId = 0;
    const count = 5;
    const date = Math.floor(Date.now() / 1000); // Current Unix timestamp
    const normalizedDate = Math.floor(date / 86400) * 86400;

    // Derive the tracking data PDA
    const [trackingDataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tracking_data"),
        provider.wallet.publicKey.toBuffer(),
        new Uint8Array(new Array(13).fill(trackerId)),
      ],
      program.programId
    );

    // Derive the tracker stats PDA
    const [trackerStatsPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tracker_stats"),
        new Uint8Array(new Array(13).fill(trackerId)),
        new Uint8Array(new Array(13).fill(normalizedDate)),
      ],
      program.programId
    );

    const tx = await program.methods
      .addTrackingData(trackerId, count, new anchor.BN(date))
      .accounts({
        trackingData: trackingDataPda,
        user: provider.wallet.publicKey,
        programState: programStatePda,
        systemProgram: anchor.web3.SystemProgram.programId,
        trackerStats: trackerStatsPda,
      })
      .rpc();

    const trackingData = await program.account.trackingData.fetch(trackingDataPda);
    expect(trackingData.user).to.eql(provider.wallet.publicKey);
    expect(trackingData.trackerId).to.equal(trackerId);
    expect(trackingData.tracks).to.have.lengthOf(1);
    expect(trackingData.tracks[0].count).to.equal(count);
    expect(trackingData.tracks[0].date.toNumber()).to.equal(normalizedDate);
  });

  it("Gets user tracking data", async () => {
    const trackerId = 0;
    const [trackingDataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tracking_data"),
        provider.wallet.publicKey.toBuffer(),
        new Uint8Array(new Array(13).fill(trackerId)),
      ],
      program.programId
    );

    const tracks = await program.methods
      .getUserTrackingData(trackerId)
      .accounts({
        programState: programStatePda,
        trackingData: trackingDataPda,
      })
      .view();

    expect(tracks).to.have.lengthOf(1);
    expect(tracks[0].count).to.equal(5);
  });

  it("Fails to create tracker with non-authority account", async () => {
    // Create a new wallet for testing
    const otherWallet = anchor.web3.Keypair.generate();
    
    try {
      await program.methods
        .createTracker("Another Tracker", "Should fail")
        .accounts({
          programState: programStatePda,
          authority: otherWallet.publicKey,
        })
        .signers([otherWallet])
        .rpc();
      
      // If we get here, the test should fail
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.include("Unauthorized");
    }
  });

  it("Fails to add tracking data with invalid tracker ID", async () => {
    const invalidTrackerId = 999;
    const count = 5;
    const date = Math.floor(Date.now() / 1000);
    const normalizedDate = Math.floor(date / 86400) * 86400;
    
    const [trackingDataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tracking_data"),
        provider.wallet.publicKey.toBuffer(),
        new Uint8Array(new Array(13).fill(invalidTrackerId)),
      ],
      program.programId
    );

    const [trackerStatsPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tracker_stats"),
        new Uint8Array(new Array(13).fill(invalidTrackerId)),
        new Uint8Array(new Array(13).fill(normalizedDate)),
      ],
      program.programId
    );

    try {
      await program.methods
        .addTrackingData(invalidTrackerId, count, new anchor.BN(date))
        .accounts({
          trackingData: trackingDataPda,
          user: provider.wallet.publicKey,
          programState: programStatePda,
          systemProgram: anchor.web3.SystemProgram.programId,
          trackerStats: trackerStatsPda,
        })
        .rpc();
      
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.include("Invalid tracker ID");
    }
  });

  it("Gets tracker stats for a specific date", async () => {
    const trackerId = 0;
    const currentDate = Math.floor(Date.now() / 1000);
    const tenDays = 86400 * 10;
    const testDate = currentDate - tenDays;
    const normalizedTestDate = Math.floor(testDate / 86400) * 86400;
    const count = 5;

    // Create another wallet for testing
    const otherWallet = anchor.web3.Keypair.generate();
    
    // Airdrop SOL to the other wallet
    const airdropTx = await provider.connection.requestAirdrop(
      otherWallet.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropTx);

    const [trackingDataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tracking_data"),
        provider.wallet.publicKey.toBuffer(),
        new Uint8Array(new Array(13).fill(trackerId)),
      ],
      program.programId
    );

    const [trackerStatsPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tracker_stats"),
        new Uint8Array(new Array(13).fill(trackerId)),
        new Uint8Array(new Array(13).fill(normalizedTestDate)),
      ],
      program.programId
    );

    // First user adds tracking data
    await program.methods
      .addTrackingData(trackerId, count, new anchor.BN(normalizedTestDate))
      .accounts({
        trackingData: trackingDataPda,
        user: provider.wallet.publicKey,
        programState: programStatePda,
        systemProgram: anchor.web3.SystemProgram.programId,
        trackerStats: trackerStatsPda,
      })
      .rpc();

    const [otherTrackingDataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tracking_data"),
        otherWallet.publicKey.toBuffer(),
        new Uint8Array(new Array(13).fill(trackerId)),
      ],
      program.programId
    );

    // Second user adds tracking data
    await program.methods
      .addTrackingData(trackerId, count, new anchor.BN(normalizedTestDate))
      .accounts({
        trackingData: otherTrackingDataPda,
        user: otherWallet.publicKey,
        programState: programStatePda,
        systemProgram: anchor.web3.SystemProgram.programId,
        trackerStats: trackerStatsPda,
      })
      .signers([otherWallet])
      .rpc();

    // Get stats for the specific date using the view function
    const stats = await program.methods
      .getTrackerStats(trackerId, new anchor.BN(normalizedTestDate))
      .accounts({
        programState: programStatePda,
        trackerStats: trackerStatsPda,
      })
      .view();

    expect(stats.totalCount).to.equal(count * 2);
    expect(stats.uniqueUsers).to.equal(2);
  });

  it("Gets user streak", async () => {
    const trackerId = 0;
    const currentDate = Math.floor(Date.now() / 1000);
    const oneDay = 86400;
    const normalizedCurrentDate = Math.floor(currentDate / oneDay) * oneDay;
    const normalizedYesterday = normalizedCurrentDate - oneDay;
    const count = 5;

    console.log('Current date:', new Date(currentDate * 1000).toISOString());
    console.log('Normalized current date:', new Date(normalizedCurrentDate * 1000).toISOString());
    console.log('Normalized yesterday:', new Date(normalizedYesterday * 1000).toISOString());

    const [trackingDataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tracking_data"),
        provider.wallet.publicKey.toBuffer(),
        new Uint8Array(new Array(13).fill(trackerId)),
      ],
      program.programId
    );

    const [yesterdayTrackerStatsPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tracker_stats"),
        new Uint8Array(new Array(13).fill(trackerId)),
        new Uint8Array(new Array(13).fill(normalizedYesterday)),
      ],
      program.programId
    );

    // Add yesterday's tracking data first
    await program.methods
      .addTrackingData(trackerId, count, new anchor.BN(normalizedYesterday))
      .accounts({
        trackingData: trackingDataPda,
        user: provider.wallet.publicKey,
        programState: programStatePda,
        systemProgram: anchor.web3.SystemProgram.programId,
        trackerStats: yesterdayTrackerStatsPda,
      })
      .rpc();

    const [currentTrackerStatsPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tracker_stats"),
        new Uint8Array(new Array(13).fill(trackerId)),
        new Uint8Array(new Array(13).fill(normalizedCurrentDate)),
      ],
      program.programId
    );

    // Add today's tracking data
    await program.methods
      .addTrackingData(trackerId, count, new anchor.BN(normalizedCurrentDate))
      .accounts({
        trackingData: trackingDataPda,
        user: provider.wallet.publicKey,
        programState: programStatePda,
        systemProgram: anchor.web3.SystemProgram.programId,
        trackerStats: currentTrackerStatsPda,
      })
      .rpc();

    // Get tracking data to verify
    const trackingData = await program.account.trackingData.fetch(trackingDataPda);
    console.log('Tracking data tracks:', trackingData.tracks.map(t => ({
      date: new Date(t.date.toNumber() * 1000).toISOString(),
      count: t.count
    })));

    const streak = await program.methods
      .getUserStreak(trackerId)
      .accounts({
        programState: programStatePda,
        trackingData: trackingDataPda,
      })
      .view();

    expect(streak).to.equal(2);
  });

  it("Breaks streak when there's a gap", async () => {
    const trackerId = 0;
    const currentDate = Math.floor(Date.now() / 1000);
    const twoDays = 86400 * 2;
    const normalizedCurrentDate = Math.floor(currentDate / 86400) * 86400;
    const normalizedTwoDaysAgo = normalizedCurrentDate - twoDays;
    const count = 5;

    const [trackingDataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tracking_data"),
        provider.wallet.publicKey.toBuffer(),
        new Uint8Array(new Array(13).fill(trackerId)),
      ],
      program.programId
    );

    const [currentTrackerStatsPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tracker_stats"),
        new Uint8Array(new Array(13).fill(trackerId)),
        new Uint8Array(new Array(13).fill(normalizedCurrentDate)),
      ],
      program.programId
    );

    // Add today's tracking data
    await program.methods
      .addTrackingData(trackerId, count, new anchor.BN(normalizedCurrentDate))
      .accounts({
        trackingData: trackingDataPda,
        user: provider.wallet.publicKey,
        programState: programStatePda,
        systemProgram: anchor.web3.SystemProgram.programId,
        trackerStats: currentTrackerStatsPda,
      })
      .rpc();

    const [twoDaysAgoTrackerStatsPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tracker_stats"),
        new Uint8Array(new Array(13).fill(trackerId)),
        new Uint8Array(new Array(13).fill(normalizedTwoDaysAgo)),
      ],
      program.programId
    );

    // Add tracking data from two days ago
    await program.methods
      .addTrackingData(trackerId, count, new anchor.BN(normalizedTwoDaysAgo))
      .accounts({
        trackingData: trackingDataPda,
        user: provider.wallet.publicKey,
        programState: programStatePda,
        systemProgram: anchor.web3.SystemProgram.programId,
        trackerStats: twoDaysAgoTrackerStatsPda,
      })
      .rpc();

    const streak = await program.methods
      .getUserStreak(trackerId)
      .accounts({
        programState: programStatePda,
        trackingData: trackingDataPda,
      })
      .view();
    
    const getUserTrackingData = await program.methods
      .getUserTrackingData(trackerId)
      .accounts({
        programState: programStatePda,
        trackingData: trackingDataPda,
      })
      .view();
    for (const track of getUserTrackingData) {
      console.log('track Date and Count', new Date(track.date.toNumber() * 1000).toISOString(), track.count);
    }
    expect(streak).to.equal(3);
  });
});
