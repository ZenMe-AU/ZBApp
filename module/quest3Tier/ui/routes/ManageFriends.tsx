/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Helmet } from "react-helmet";
import { Alert, Box, Button, Container, IconButton, List, ListItem, ListItemText, TextField, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { addFriend, getShareFriends, type ShareFriend } from "../api/profile";

const relationshipLabels = ["", "Friend", "Friend's friend", "3rd-degree connection", "4th-degree connection"];

export default function ManageFriends() {
  const navigate = useNavigate();
  const [friends, setFriends] = useState<ShareFriend[]>([]);
  const [profileId, setProfileId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFriends = async () => {
    try {
      setLoading(true);
      setFriends(await getShareFriends());
      setError(null);
    } catch {
      setError("Friends could not be loaded. Please check your Q3 API connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFriends();
  }, []);

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    if (!profileId.trim()) return;
    try {
      setSaving(true);
      setError(null);
      await addFriend(profileId.trim());
      setProfileId("");
      await loadFriends();
    } catch {
      setError("Friend could not be added. Use the person's Q3 profile ID.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 4 }}>
      <Helmet>
        <title>Manage Friends</title>
      </Helmet>
      <Box display="flex" alignItems="center" mb={2}>
        <IconButton aria-label="Back to questions" onClick={() => navigate(-1)}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4">Manage friends</Typography>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Friends appear by name in the Share list. Add someone with their Q3 profile ID.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box component="form" onSubmit={handleAdd} display="flex" gap={1} mb={3}>
        <TextField
          fullWidth
          label="Friend profile ID"
          value={profileId}
          onChange={(event) => setProfileId(event.target.value)}
          disabled={saving}
        />
        <Button type="submit" variant="contained" disabled={saving || !profileId.trim()}>
          {saving ? "Adding…" : "Add"}
        </Button>
      </Box>
      <Typography variant="h6">People available to share with</Typography>
      {loading ? <Typography sx={{ mt: 2 }}>Loading…</Typography> : (
        <List>
          {friends.map((friend) => (
            <ListItem key={friend.id} divider>
              <ListItemText primary={friend.name} secondary={relationshipLabels[friend.degree] || "Connection"} />
            </ListItem>
          ))}
          {!friends.length && <ListItem><ListItemText primary="No friends yet" secondary="Add a profile ID above to start sharing." /></ListItem>}
        </List>
      )}
    </Container>
  );
}
