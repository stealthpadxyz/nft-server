const minify = require('pg-minify');

const checkCollection = require('../../utils/checkAddress');
const { convertKeysToCamelCase } = require('../../utils/keyConversion');
const { customHeaderFixedCache } = require('../../utils/customHeader');
const { indexa } = require('../../utils/dbConnection');

const getTransfers = async (req, res) => {
  let { collectionId, tokenId, excludeSales } = req.query;
  if (!collectionId || !tokenId || !checkCollection(collectionId))
    return res.status(400).json('invalid collectionId/tokenId!');

  // artblocks
  if (collectionId.includes(':')) {
    collectionId = collectionId.split(':')[0];
  }

  const query = minify(`
  SELECT
    encode(t.transaction_hash, 'hex') AS transaction_hash,
    t.log_index,
    t.block_time,
    t.block_number,
    encode(t.from_address, 'hex') AS from_address,
    encode(t.to_address, 'hex') AS to_address,
    t.amount
  FROM
    ethereum.nft_transfers AS t
  WHERE
    t.collection = $<collectionId>
    AND t.token_id = $<tokenId>
    ${
      excludeSales
        ? 'AND NOT EXISTS (SELECT 1 FROM ethereum.nft_trades AS trades WHERE trades.collection = $<collectionId> AND trades.token_id = $<tokenId> AND trades.transaction_hash = t.transaction_hash)'
        : ''
    }
    `);

  const response = await indexa.query(query, {
    collectionId: `\\${collectionId.slice(1)}`,
    tokenId,
  });

  if (!response) {
    return new Error(`Couldn't get data`, 404);
  }

  res
    .set(customHeaderFixedCache(300))
    .status(200)
    .json(response.map((c) => convertKeysToCamelCase(c)));
};

const getNfts = async (req, res) => {
  const query = minify(`
WITH receiver AS (
    SELECT
        *
    FROM
        ethereum.nft_transfers
    WHERE
        to_address = $<address>
        OR from_address = $<address>
),
max_date AS (
    SELECT
        collection,
        token_id,
        max(block_number) AS block_number
    FROM
        receiver
    GROUP BY
        collection,
        token_id
),
latest AS (
    SELECT
        *
    FROM
        receiver r
    WHERE
        EXISTS (
            SELECT
                1
            FROM
                max_date m
            WHERE
                r.collection = m.collection
                AND r.token_id = m.token_id
                AND r.block_number = m.block_number
        )
)
SELECT
    encode(transaction_hash, 'hex') AS transaction_hash,
    encode(collection, 'hex') AS collection,
    encode(token_id, 'escape') AS token_id,
    encode(from_address, 'hex') AS from_address,
    encode(to_address, 'hex') AS to_address,
    log_index,
    block_time,
    block_number
FROM
    latest
WHERE
    to_address = $<address>
  `);

  const address = req.params.address;
  if (!checkCollection(address))
    return res.status(400).json('invalid address!');

  const response = await indexa.query(query, {
    address: `\\${address.slice(1)}`,
  });

  if (!response) {
    return new Error(`Couldn't get data`, 404);
  }

  res
    .set(customHeaderFixedCache(300))
    .status(200)
    .json(response.map((c) => convertKeysToCamelCase(c)));
};

module.exports = {
  getTransfers,
  getNfts,
};
