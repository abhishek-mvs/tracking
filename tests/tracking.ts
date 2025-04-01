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
    [Buffer.from("program_state")],
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
        Buffer.from(new Uint8Array(new Uint32Array([trackerId]).buffer)),
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
        Buffer.from(new Uint8Array(new Uint32Array([trackerId]).buffer)),
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
    const date = Math.floor(Date.now() / 1000); // Current Unix timestamp
    const [trackingDataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tracking_data"),
        provider.wallet.publicKey.toBuffer(),
        Buffer.from(new Uint8Array(new Uint32Array([invalidTrackerId]).buffer)),
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
        })
        .rpc();
      
      // If we get here, the test should fail
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.include("Invalid tracker ID");
    }
  });

  it("Gets tracker stats for a specific date", async () => {
    const trackerId = 0;
    const currentDate = Math.floor(Date.now() / 1000);
    const oneDay = 86400; // 24 hours in seconds
    const normalizedCurrentDate = Math.floor(currentDate / oneDay) * oneDay;
    const count = 5;

    // Derive the tracker stats PDA
    const [trackerStatsPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tracker_stats"),
        Buffer.from(new Uint8Array(new Uint32Array([trackerId]).buffer)),
        Buffer.from(new Uint8Array(new BigUint64Array([BigInt(normalizedCurrentDate)]).buffer)),
      ],
      program.programId
    );

    // Add tracking data for the current user
    const [trackingDataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tracking_data"),
        provider.wallet.publicKey.toBuffer(),
        Buffer.from(new Uint8Array(new Uint32Array([trackerId]).buffer)),
      ],
      program.programId
    );

    // Add data for today
    await program.methods
      .addTrackingData(trackerId, count, new anchor.BN(normalizedCurrentDate))
      .accounts({
        trackingData: trackingDataPda,
        user: provider.wallet.publicKey,
        programState: programStatePda,
        systemProgram: anchor.web3.SystemProgram.programId,
        trackerStats: trackerStatsPda,
      })
      .rpc();

    // Create another wallet and add tracking data
    const otherWallet = anchor.web3.Keypair.generate();
    const [otherTrackingDataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tracking_data"),
        otherWallet.publicKey.toBuffer(),
        Buffer.from(new Uint8Array(new Uint32Array([trackerId]).buffer)),
      ],
      program.programId
    );

    // Airdrop SOL to the other wallet
    const airdropTx = await provider.connection.requestAirdrop(
      otherWallet.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropTx);

    await program.methods
      .addTrackingData(trackerId, count, new anchor.BN(normalizedCurrentDate))
      .accounts({
        trackingData: otherTrackingDataPda,
        user: otherWallet.publicKey,
        programState: programStatePda,
        systemProgram: anchor.web3.SystemProgram.programId,
        trackerStats: trackerStatsPda,
      })
      .signers([otherWallet])
      .rpc();

    // Get tracker stats
    const stats = await program.methods
      .getTrackerStats(trackerId, new anchor.BN(normalizedCurrentDate))
      .accounts({
        programState: programStatePda,
        trackerStats: trackerStatsPda,
      })
      .view();

    expect(stats.totalCount).to.equal(count * 2); // 5 from each user
    expect(stats.uniqueUsers).to.equal(2); // Two different users
  });

  it("Gets user streak", async () => {
    const trackerId = 0;
    const currentDate = Math.floor(Date.now() / 1000);
    const oneDay = 86400; // 24 hours in seconds
    const normalizedCurrentDate = Math.floor(currentDate / oneDay) * oneDay;
    const normalizedYesterday = normalizedCurrentDate - oneDay;
    const count = 5;

    // Add tracking data for today and yesterday
    const [trackingDataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tracking_data"),
        provider.wallet.publicKey.toBuffer(),
        Buffer.from(new Uint8Array(new Uint32Array([trackerId]).buffer)),
      ],
      program.programId
    );

    // Add data for today
    await program.methods
      .addTrackingData(trackerId, count, new anchor.BN(normalizedCurrentDate))
      .accounts({
        trackingData: trackingDataPda,
        user: provider.wallet.publicKey,
        programState: programStatePda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Add data for yesterday
    await program.methods
      .addTrackingData(trackerId, count, new anchor.BN(normalizedYesterday))
      .accounts({
        trackingData: trackingDataPda,
        user: provider.wallet.publicKey,
        programState: programStatePda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Get user streak
    const streak = await program.methods
      .getUserStreak(trackerId)
      .accounts({
        programState: programStatePda,
        trackingData: trackingDataPda,
      })
      .view();

    expect(streak).to.equal(2); // Streak of 2 days
  });

  it("Breaks streak when there's a gap", async () => {
    const trackerId = 0;
    const currentDate = Math.floor(Date.now() / 1000);
    const twoDaysAgo = currentDate - 172800; // 48 hours in seconds
    const count = 5;

    // Add tracking data for today and two days ago
    const [trackingDataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tracking_data"),
        provider.wallet.publicKey.toBuffer(),
        Buffer.from(new Uint8Array(new Uint32Array([trackerId]).buffer)),
      ],
      program.programId
    );

    // Add data for today
    await program.methods
      .addTrackingData(trackerId, count, new anchor.BN(currentDate))
      .accounts({
        trackingData: trackingDataPda,
        user: provider.wallet.publicKey,
        programState: programStatePda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Add data for two days ago
    await program.methods
      .addTrackingData(trackerId, count, new anchor.BN(twoDaysAgo))
      .accounts({
        trackingData: trackingDataPda,
        user: provider.wallet.publicKey,
        programState: programStatePda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Get user streak
    const streak = await program.methods
      .getUserStreak(trackerId)
      .accounts({
        programState: programStatePda,
        trackingData: trackingDataPda,
      })
      .view();

    expect(streak).to.equal(1); // Streak broken, only today counts
  });
});
