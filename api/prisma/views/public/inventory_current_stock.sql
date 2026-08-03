SELECT
  item_id,
  location,
  sum(quantity) AS quantity_on_hand
FROM
  inventory_transactions
GROUP BY
  item_id,
  location;