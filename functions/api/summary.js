  // =========================
  // 3.5) Activity sample (LOW SUBREQUESTS)
  //   - 1 block fetch + 1 logs fetch
  // =========================
  try {
    if (!rpcHealthy) throw new Error("RPC not healthy");

    // full tx objects (to detect contract creation count without extra calls)
    const blk = await rpcCall("eth_getBlockByNumber", ["latest", true], 12000);
    const blockNumberHex = blk?.number;
    const txs = Array.isArray(blk?.transactions) ? blk.transactions : [];
    const txCount = txs.length;
    const createCount = txs.filter((tx) => !tx?.to).length;

    if (!blockNumberHex || !txCount) {
      out.activity_sample = null;
      out.activity_note = "No transactions in latest block.";
    } else {
      // Get all ERC-20 Transfer logs in this block (topic0 only)
      const logs = await rpcCall(
        "eth_getLogs",
        [{
          fromBlock: blockNumberHex,
          toBlock: blockNumberHex,
          topics: [TRANSFER_TOPIC0],
        }],
        12000
      );

      const arr = Array.isArray(logs) ? logs : [];
      const tokenTxSet = new Set(
        arr.map((lg) => String(lg?.transactionHash || "").toLowerCase()).filter(Boolean)
      );
      const tokenTxCount = tokenTxSet.size;

      // "native_pct" here means "non-token tx share" (NOT value transfer)
      const nonTokenCount = Math.max(0, txCount - tokenTxCount);

      const pct = (x) => (txCount ? (x * 100) / txCount : null);

      out.activity_sample = {
        sample_n: txCount,
        token_pct: pct(tokenTxCount),
        native_pct: pct(nonTokenCount),
        create_pct: pct(createCount),
        // optional hints
        token_contract_sample: arr[0]?.address || null,
      };

      out.activity_note =
        `Computed from latest block only. token_pct = unique txs with ERC20 Transfer logs(topic0). ` +
        `native_pct = remaining tx share (NOT "value transfers"). tx=${txCount}`;
    }
  } catch (e) {
    out.activity_sample = null;
    out.activity_note = null;
    out.warnings.push(`activity_sample:${e.message}`);
  }
