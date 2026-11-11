/* "Chat" flow launched from a My Contacts row — lets the user start a
   private chat with a contact, or invite the contact into one of the
   public channels the current user already belongs to. Reuses the
   chat app's own invite mechanism (client/src/lib/chatInvites.js) so
   the recipient shows up on the Chat page's normal "Invitations" flow
   exactly as if they'd been invited from there. The private-chat step
   asks the same questions (name + description) as Chat's own "New
   channel" dialog. Styled to match the ct-profile-* dialog shell
   (which itself mirrors the Chat page's own modal look) for visual
   consistency across the two features. */

import { useState, useEffect } from 'react';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { sendInvite } from '../../lib/chatInvites';

/** Live list of public channels the current user is already a member of. */
function usePublicChannelsIBelongTo(myUid, active) {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!active || !myUid || !db) {
      setChannels([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, 'channels'),
      where('type', '==', 'public'),
      where('memberUids', 'array-contains', myUid),
    );
    const unsub = onSnapshot(q, (snap) => {
      setChannels(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [myUid, active]);

  return { channels, loading };
}

export default function ChatConnectModal({ open, onClose, contact, myUid, myName }) {
  const [step, setStep] = useState('choose'); // 'choose' | 'privateForm' | 'public' | 'done'
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [doneMessage, setDoneMessage] = useState('');
  const [invitedChannelIds, setInvitedChannelIds] = useState(() => new Set());

  const { channels, loading: channelsLoading } = usePublicChannelsIBelongTo(myUid, open && step === 'public');

  useEffect(() => {
    if (!open) {
      setStep('choose');
      setBusy(false);
      setError(null);
      setDoneMessage('');
      setInvitedChannelIds(new Set());
      setName('');
      setDescription('');
    } else {
      setName(contact?.displayName || '');
      setDescription('');
    }
  }, [open, contact]);

  if (!open || !contact) return null;

  const goToStep = (next) => {
    setError(null);
    setStep(next);
  };

  const handleCreatePrivate = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Channel name is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const trimmedName = name.trim();
      const trimmedDescription = description.trim();
      const docRef = await addDoc(collection(db, 'channels'), {
        type:        'private',
        name:        trimmedName,
        description: trimmedDescription,
        ownerUid:    myUid,
        memberUids:  [myUid],
        soloInvite:  true,
        createdAt:   serverTimestamp(),
        updatedAt:   serverTimestamp(),
      });
      await sendInvite({
        channel:       { id: docRef.id, name: trimmedName, description: trimmedDescription, memberUids: [myUid] },
        inviteeUid:    contact.uid,
        inviteeName:   contact.displayName || 'Member',
        invitedByName: myName,
      });
      setDoneMessage(`Created "${trimmedName}" and invited ${contact.displayName || 'them'}. They'll see it waiting once they accept.`);
      setStep('done');
    } catch (err) {
      setError(err?.message || 'Could not start the chat.');
    } finally {
      setBusy(false);
    }
  };

  const handleInviteToChannel = async (channel) => {
    setBusy(true);
    setError(null);
    try {
      await sendInvite({
        channel,
        inviteeUid:    contact.uid,
        inviteeName:   contact.displayName || 'Member',
        invitedByName: myName,
      });
      setInvitedChannelIds(prev => new Set(prev).add(channel.id));
    } catch (err) {
      setError(err?.message || 'Could not send the invite.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ct-profile-backdrop" onClick={onClose}>
      <div className="ct-profile-modal ct-chat-modal" role="dialog" aria-label="Start a chat" onClick={e => e.stopPropagation()}>
        <div className="ct-profile-modal-head">
          <span className="ct-profile-modal-title">Chat with {contact.displayName || 'Member'}</span>
          <button type="button" className="ct-profile-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="ct-profile-modal-body">
          {error && <div className="ct-chat-error">{error}</div>}

          {step === 'choose' && (
            <>
              <div className="ct-chat-hint">Where would you like to chat with {contact.displayName || 'them'}?</div>
              <div className="ct-chat-choice-row">
                <button type="button" className="ct-chat-choice" disabled={busy} onClick={() => goToStep('privateForm')}>
                  <span className="ct-chat-choice-icon">🔒</span>
                  <span className="ct-chat-choice-label">Private</span>
                  <span className="ct-chat-choice-sub">Just the two of you</span>
                </button>
                <button type="button" className="ct-chat-choice" disabled={busy} onClick={() => goToStep('public')}>
                  <span className="ct-chat-choice-icon">🌐</span>
                  <span className="ct-chat-choice-label">Public</span>
                  <span className="ct-chat-choice-sub">Invite into a room you're in</span>
                </button>
              </div>
            </>
          )}

          {step === 'privateForm' && (
            <form onSubmit={handleCreatePrivate}>
              <div className="ct-chat-hint">Set up your private chat with {contact.displayName || 'them'}.</div>

              <label className="ct-field">
                <span className="ct-field-lbl">Channel name</span>
                <input
                  type="text"
                  className="ct-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Worship Team"
                  autoFocus
                />
              </label>

              <label className="ct-field">
                <span className="ct-field-lbl">Description (shown on the card)</span>
                <textarea
                  className="ct-input ct-textarea"
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What is this channel for?"
                />
              </label>

              <div className="ct-chat-form-actions">
                <button type="button" className="ct-chat-back" onClick={() => goToStep('choose')}>← Back</button>
                <button type="submit" className="app-btn primary" disabled={busy}>
                  {busy ? 'Creating…' : 'Create & invite'}
                </button>
              </div>
            </form>
          )}

          {step === 'public' && (
            <>
              <div className="ct-chat-hint">Pick a public room you're already in to invite {contact.displayName || 'them'} into.</div>
              {channelsLoading && <div className="ct-loading">Loading your rooms…</div>}
              {!channelsLoading && channels.length === 0 && (
                <div className="ct-chat-hint">You're not in any public rooms yet.</div>
              )}
              {!channelsLoading && channels.length > 0 && (
                <div className="ct-chat-channel-list">
                  {channels.map(ch => {
                    const invited = invitedChannelIds.has(ch.id);
                    return (
                      <div key={ch.id} className="ct-chat-channel-row">
                        <div className="ct-chat-channel-info">
                          <div className="ct-chat-channel-name"># {ch.name}</div>
                          <div className="ct-chat-channel-sub">{ch.memberUids?.length || 0} members</div>
                        </div>
                        <button
                          type="button"
                          className={invited ? 'ct-pill' : 'ct-btn-ghost'}
                          disabled={busy || invited}
                          onClick={() => handleInviteToChannel(ch)}
                        >
                          {invited ? '✓ Invited' : busy ? '…' : 'Invite'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <button type="button" className="ct-chat-back" onClick={() => goToStep('choose')}>← Back</button>
            </>
          )}

          {step === 'done' && (
            <div className="ct-chat-hint">{doneMessage}</div>
          )}
        </div>

        <div className="ct-profile-modal-actions">
          <button type="button" className="ct-btn-ghost" onClick={onClose}>
            {step === 'public' ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
