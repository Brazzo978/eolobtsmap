function handleDbError(res, err, message = 'DB error') {
  console.error(message, err);
  return res.status(500).json({ error: message });
}

module.exports = { handleDbError };
