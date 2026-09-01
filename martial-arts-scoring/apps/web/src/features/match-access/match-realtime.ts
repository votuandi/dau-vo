import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AthleteColor,
  RealtimeEvent,
  type MatchFinishedPayload,
  type MatchPresenceEntry,
  type MatchStatePayload,
  type PenaltyAddErrorCode,
  type PenaltyAddResponse,
  type PenaltyAddedPayload,
  type PresenceUpdatedPayload,
  type RoundEndedPayload,
  type RoundStartedPayload,
  type RoundStartErrorCode,
  type RoundStartResponse,
  type ScoreUpdatedPayload,
  type ScoringWindowOpenedPayload,
  type ScoringWindowResolvedPayload,
  type SessionRevokedPayload,
  type RefereeSlot,
  type VoteAcceptedPayload,
  type VoteRejectedPayload,
  type VoteSubmitErrorCode,
  type VoteSubmitResponse,
} from '@martial-arts-scoring/shared-types';
import {
  connectSocket,
  disconnectSocket,
  getSocketClient,
  reconnectSocket,
} from '@/services/socket/client';

export type RealtimeConnectionStatus =
  | 'authentication-required'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error'
  | 'revoked';

interface UseMatchRealtimeOptions {
  readonly matchPublicId: string;
  readonly onAuthenticationRequired: () => void;
  readonly onSessionRevoked: (payload: SessionRevokedPayload) => void;
  readonly refereeSlot: RefereeSlot | null;
}

export interface MatchRealtimeState {
  readonly connectionStatus: RealtimeConnectionStatus;
  readonly connect: () => void;
  readonly disconnect: () => void;
  readonly errorMessage: string | null;
  readonly lastAcceptedVote: VoteAcceptedPayload | null;
  readonly presence: readonly MatchPresenceEntry[];
  readonly reconnect: () => void;
  readonly requestSnapshot: () => void;
  readonly submitPenalty: (athlete: AthleteColor) => Promise<void>;
  readonly roundStartErrorMessage: string | null;
  readonly scoringWindowMessage: string | null;
  readonly snapshot: MatchStatePayload | null;
  readonly startRound: () => Promise<void>;
  readonly startingRound: boolean;
  readonly submitVote: (athlete: AthleteColor) => Promise<void>;
  readonly submittingVote: AthleteColor | null;
  readonly submittingPenalty: AthleteColor | null;
  readonly penaltyErrorMessage: string | null;
  readonly voteSubmitErrorMessage: string | null;
}

function getConnectionErrorMessage(): string {
  return 'Không thể thiết lập kết nối thời gian thực. Hệ thống sẽ tự động thử lại.';
}

function isRealtimeAuthenticationError(error: Error): boolean {
  if (!('data' in error)) {
    return false;
  }

  const { data } = error;
  return (
    typeof data === 'object' &&
    data !== null &&
    'code' in data &&
    data.code === 'REALTIME_AUTHENTICATION_REQUIRED'
  );
}

function getRoundStartErrorMessage(code: RoundStartErrorCode, fallback: string): string {
  switch (code) {
    case 'REALTIME_AUTHENTICATION_REQUIRED':
      return 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.';
    case 'ROUND_START_FORBIDDEN':
      return 'Chỉ giám định viên được phép bắt đầu hiệp đấu.';
    case 'ROUND_START_INVALID_STATE':
      return 'Không thể bắt đầu hiệp từ trạng thái hiện tại. Trạng thái mới nhất đang được tải lại.';
    case 'ROUND_START_FAILED':
      return fallback;
  }
}

function getVoteSubmitErrorMessage(code: VoteSubmitErrorCode, fallback: string): string {
  switch (code) {
    case 'REALTIME_AUTHENTICATION_REQUIRED':
      return 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.';
    case 'VOTE_FORBIDDEN':
      return 'Chỉ trọng tài được phép gửi lựa chọn chấm điểm.';
    case 'VOTE_INVALID_ATHLETE':
      return 'Lựa chọn võ sĩ không hợp lệ.';
    case 'VOTE_MATCH_NOT_RUNNING':
      return 'Chỉ có thể chấm điểm khi hiệp đấu đang diễn ra.';
    case 'VOTE_ROUND_ENDED':
      return 'Hiệp đấu đã kết thúc trước khi lựa chọn được ghi nhận.';
    case 'VOTE_ALREADY_SUBMITTED':
      return 'Lựa chọn của trọng tài cho cửa sổ chấm điểm này đã được ghi nhận.';
    case 'VOTE_SCORING_WINDOW_PENDING':
      return 'Cửa sổ chấm điểm trước đang được xử lý. Vui lòng thử lại sau giây lát.';
    case 'VOTE_FAILED':
      return fallback;
  }
}

function getPenaltyErrorMessage(code: PenaltyAddErrorCode, fallback: string): string {
  switch (code) {
    case 'REALTIME_AUTHENTICATION_REQUIRED':
      return 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.';
    case 'PENALTY_FORBIDDEN':
      return 'Chỉ giám định viên được phép ghi lỗi.';
    case 'PENALTY_INVALID_ATHLETE':
      return 'Lựa chọn võ sĩ không hợp lệ.';
    case 'PENALTY_MATCH_NOT_RUNNING':
      return 'Chỉ có thể ghi lỗi khi hiệp đấu đang diễn ra.';
    case 'PENALTY_ROUND_ENDED':
      return 'Hiệp đấu đã kết thúc trước khi lỗi được ghi nhận.';
    case 'PENALTY_FAILED':
      return fallback;
  }
}

export function useMatchRealtime({
  matchPublicId,
  onAuthenticationRequired,
  onSessionRevoked,
  refereeSlot,
}: UseMatchRealtimeOptions): MatchRealtimeState {
  const [connectionStatus, setConnectionStatus] = useState<RealtimeConnectionStatus>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [presence, setPresence] = useState<readonly MatchPresenceEntry[]>([]);
  const [lastAcceptedVote, setLastAcceptedVote] = useState<VoteAcceptedPayload | null>(null);
  const [roundStartErrorMessage, setRoundStartErrorMessage] = useState<string | null>(null);
  const [scoringWindowMessage, setScoringWindowMessage] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<MatchStatePayload | null>(null);
  const [startingRound, setStartingRound] = useState(false);
  const [submittingVote, setSubmittingVote] = useState<AthleteColor | null>(null);
  const [submittingPenalty, setSubmittingPenalty] = useState<AthleteColor | null>(null);
  const [penaltyErrorMessage, setPenaltyErrorMessage] = useState<string | null>(null);
  const [voteSubmitErrorMessage, setVoteSubmitErrorMessage] = useState<string | null>(null);
  const acceptedVoteRef = useRef<VoteAcceptedPayload | null>(null);
  const onAuthenticationRequiredRef = useRef(onAuthenticationRequired);
  const onSessionRevokedRef = useRef(onSessionRevoked);
  const voteSubmissionInFlightRef = useRef(false);

  useEffect(() => {
    onAuthenticationRequiredRef.current = onAuthenticationRequired;
    onSessionRevokedRef.current = onSessionRevoked;
  }, [onAuthenticationRequired, onSessionRevoked]);

  const requestSnapshot = useCallback(() => {
    const socket = getSocketClient();
    if (socket.connected) {
      socket.emit(RealtimeEvent.MATCH_STATE_REQUEST);
    }
  }, []);

  const connect = useCallback(() => {
    setConnectionStatus('connecting');
    setErrorMessage(null);
    connectSocket();
  }, []);

  const disconnect = useCallback(() => {
    disconnectSocket();
    setConnectionStatus('disconnected');
  }, []);

  const reconnect = useCallback(() => {
    setConnectionStatus('reconnecting');
    setErrorMessage(null);
    reconnectSocket();
  }, []);

  const startRound = useCallback(async () => {
    const socket = getSocketClient();
    if (!socket.connected) {
      setRoundStartErrorMessage(
        'Chưa kết nối với máy chủ. Vui lòng kết nối lại trước khi bắt đầu hiệp.',
      );
      return;
    }

    setStartingRound(true);
    setRoundStartErrorMessage(null);

    try {
      const response = await new Promise<RoundStartResponse>((resolve, reject) => {
        socket
          .timeout(10_000)
          .emit(
            RealtimeEvent.ROUND_START,
            (error: Error | null, acknowledgement: RoundStartResponse) => {
              if (error) {
                reject(error);
                return;
              }

              resolve(acknowledgement);
            },
          );
      });
      if (!response.ok) {
        setRoundStartErrorMessage(
          getRoundStartErrorMessage(response.error.code, response.error.message),
        );
        socket.emit(RealtimeEvent.MATCH_STATE_REQUEST);

        if (response.error.code === 'REALTIME_AUTHENTICATION_REQUIRED') {
          socket.disconnect();
          setConnectionStatus('authentication-required');
          onAuthenticationRequiredRef.current();
        }
        return;
      }

      // The acknowledgement confirms persistence. The subsequent snapshot remains the
      // authoritative source for every displayed match field.
      socket.emit(RealtimeEvent.MATCH_STATE_REQUEST);
    } catch {
      setRoundStartErrorMessage(
        'Máy chủ không phản hồi lệnh bắt đầu hiệp. Vui lòng kiểm tra trạng thái và thử lại.',
      );
    } finally {
      setStartingRound(false);
    }
  }, []);

  const submitVote = useCallback(async (athlete: AthleteColor) => {
    const socket = getSocketClient();
    if (voteSubmissionInFlightRef.current || acceptedVoteRef.current !== null) {
      return;
    }
    if (!socket.connected) {
      setVoteSubmitErrorMessage(
        'Chưa kết nối với máy chủ. Vui lòng kết nối lại trước khi chấm điểm.',
      );
      return;
    }

    voteSubmissionInFlightRef.current = true;
    setSubmittingVote(athlete);
    setVoteSubmitErrorMessage(null);

    try {
      const response = await new Promise<VoteSubmitResponse>((resolve, reject) => {
        socket
          .timeout(10_000)
          .emit(
            RealtimeEvent.VOTE_SUBMIT,
            { athlete },
            (error: Error | null, acknowledgement: VoteSubmitResponse) => {
              if (error) {
                reject(error);
                return;
              }

              resolve(acknowledgement);
            },
          );
      });

      if (!response.ok) {
        voteSubmissionInFlightRef.current = false;
        setSubmittingVote(null);
        setVoteSubmitErrorMessage(
          getVoteSubmitErrorMessage(response.error.code, response.error.message),
        );

        if (response.error.code === 'REALTIME_AUTHENTICATION_REQUIRED') {
          socket.disconnect();
          setConnectionStatus('authentication-required');
          onAuthenticationRequiredRef.current();
        }
        return;
      }

      // The server also sends vote:accepted to this socket. Keep the control
      // locally locked until that event arrives; an acknowledgement alone is
      // not presented as an officially recorded referee choice.
    } catch {
      voteSubmissionInFlightRef.current = false;
      setSubmittingVote(null);
      setVoteSubmitErrorMessage(
        'Máy chủ không phản hồi lựa chọn chấm điểm. Vui lòng kiểm tra trạng thái trước khi thử lại.',
      );
    }
  }, []);

  const submitPenalty = useCallback(async (athlete: AthleteColor) => {
    const socket = getSocketClient();
    if (!socket.connected) {
      setPenaltyErrorMessage('Chưa kết nối với máy chủ. Vui lòng kết nối lại trước khi ghi lỗi.');
      return;
    }

    setSubmittingPenalty(athlete);
    setPenaltyErrorMessage(null);
    try {
      const response = await new Promise<PenaltyAddResponse>((resolve, reject) => {
        socket
          .timeout(10_000)
          .emit(
            RealtimeEvent.PENALTY_ADD,
            { athlete },
            (error: Error | null, acknowledgement: PenaltyAddResponse) => {
              if (error) {
                reject(error);
                return;
              }
              resolve(acknowledgement);
            },
          );
      });
      if (!response.ok) {
        setPenaltyErrorMessage(getPenaltyErrorMessage(response.error.code, response.error.message));
        if (response.error.code === 'REALTIME_AUTHENTICATION_REQUIRED') {
          socket.disconnect();
          setConnectionStatus('authentication-required');
          onAuthenticationRequiredRef.current();
        }
      }
    } catch {
      setPenaltyErrorMessage(
        'Máy chủ không phản hồi lệnh ghi lỗi. Vui lòng kiểm tra trạng thái trước khi thử lại.',
      );
    } finally {
      setSubmittingPenalty(null);
    }
  }, []);

  useEffect(() => {
    const socket = getSocketClient();

    function handleConnect(): void {
      setConnectionStatus('connected');
      setErrorMessage(null);
      socket.emit(RealtimeEvent.MATCH_STATE_REQUEST);
    }

    function handleDisconnect(): void {
      setConnectionStatus(socket.active ? 'reconnecting' : 'disconnected');
    }

    function handleConnectError(error: Error): void {
      if (isRealtimeAuthenticationError(error)) {
        socket.disconnect();
        setConnectionStatus('authentication-required');
        setErrorMessage('Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.');
        onAuthenticationRequiredRef.current();
        return;
      }

      setConnectionStatus(socket.active ? 'reconnecting' : 'error');
      setErrorMessage(getConnectionErrorMessage());
    }

    function handleReconnectAttempt(): void {
      setConnectionStatus('reconnecting');
      setErrorMessage(null);
    }

    function handleReconnectFailed(): void {
      setConnectionStatus('error');
      setErrorMessage(getConnectionErrorMessage());
    }

    function handleMatchState(payload: MatchStatePayload): void {
      if (payload.match.publicId !== matchPublicId) {
        return;
      }

      setSnapshot(payload);
      setPresence(payload.presence);

      // `viewer` is intentionally present only on a direct, authenticated
      // snapshot. It restores the local per-referee lock after a refresh or
      // reconnect without inferring anything from scores or browser time.
      if (payload.viewer !== undefined) {
        const acceptedVote = payload.viewer.acceptedVote;
        acceptedVoteRef.current = acceptedVote;
        setLastAcceptedVote(acceptedVote);
        voteSubmissionInFlightRef.current = false;
        setSubmittingVote(null);
      }
    }

    function handlePresenceUpdated(payload: PresenceUpdatedPayload): void {
      if (payload.matchPublicId !== matchPublicId) {
        return;
      }

      setPresence(payload.presence);
      setSnapshot((currentSnapshot) =>
        currentSnapshot
          ? {
              ...currentSnapshot,
              presence: payload.presence,
            }
          : null,
      );
    }

    function handleSessionRevoked(payload: SessionRevokedPayload): void {
      // Explicit disconnect disables retries for this revoked cookie. A later authenticated
      // page mount can still call connect() on the singleton normally.
      socket.disconnect();
      setConnectionStatus('revoked');
      setSnapshot(null);
      setPresence([]);
      acceptedVoteRef.current = null;
      setLastAcceptedVote(null);
      voteSubmissionInFlightRef.current = false;
      setSubmittingVote(null);
      onSessionRevokedRef.current(payload);
    }

    function handleRoundStarted(payload: RoundStartedPayload): void {
      if (payload.matchPublicId === matchPublicId) {
        setRoundStartErrorMessage(null);
        acceptedVoteRef.current = null;
        setLastAcceptedVote(null);
        voteSubmissionInFlightRef.current = false;
        setSubmittingVote(null);
        setScoringWindowMessage(null);
        setVoteSubmitErrorMessage(null);
        setPenaltyErrorMessage(null);
        socket.emit(RealtimeEvent.MATCH_STATE_REQUEST);
      }
    }

    function handleRoundEnded(payload: RoundEndedPayload): void {
      if (payload.matchPublicId === matchPublicId) {
        setRoundStartErrorMessage(null);
        acceptedVoteRef.current = null;
        setLastAcceptedVote(null);
        voteSubmissionInFlightRef.current = false;
        setSubmittingVote(null);
        setScoringWindowMessage(null);
        setVoteSubmitErrorMessage(null);
        setPenaltyErrorMessage(null);
        socket.emit(RealtimeEvent.MATCH_STATE_REQUEST);
      }
    }

    function handleMatchFinished(payload: MatchFinishedPayload): void {
      if (payload.matchPublicId === matchPublicId) {
        setRoundStartErrorMessage(null);
        acceptedVoteRef.current = null;
        setLastAcceptedVote(null);
        voteSubmissionInFlightRef.current = false;
        setSubmittingVote(null);
        setScoringWindowMessage(null);
        setVoteSubmitErrorMessage(null);
        setPenaltyErrorMessage(null);
        socket.emit(RealtimeEvent.MATCH_STATE_REQUEST);
      }
    }

    function handleVoteAccepted(payload: VoteAcceptedPayload): void {
      if (
        payload.matchPublicId === matchPublicId &&
        refereeSlot !== null &&
        payload.refereeSlot === refereeSlot
      ) {
        acceptedVoteRef.current = payload;
        voteSubmissionInFlightRef.current = false;
        setSubmittingVote(null);
        setVoteSubmitErrorMessage(null);
        setLastAcceptedVote(payload);
      }
    }

    function handleVoteRejected(payload: VoteRejectedPayload): void {
      if (payload.matchPublicId !== matchPublicId) {
        return;
      }

      setVoteSubmitErrorMessage(
        getVoteSubmitErrorMessage(payload.error.code, payload.error.message),
      );
      voteSubmissionInFlightRef.current = false;
      setSubmittingVote(null);
    }

    function handleScoringWindowOpened(payload: ScoringWindowOpenedPayload): void {
      if (payload.matchPublicId === matchPublicId) {
        if (acceptedVoteRef.current?.scoringWindowId !== payload.window.id) {
          acceptedVoteRef.current = null;
          setLastAcceptedVote(null);
        }
        setVoteSubmitErrorMessage(null);
        setScoringWindowMessage('Cửa sổ chấm điểm đang thu thập lựa chọn của các trọng tài.');
      }
    }

    function handleScoringWindowResolved(payload: ScoringWindowResolvedPayload): void {
      if (payload.matchPublicId !== matchPublicId) {
        return;
      }

      setScoringWindowMessage(
        payload.window.scoreAwarded
          ? 'Cửa sổ chấm điểm đã được xử lý và bảng điểm đang được cập nhật.'
          : 'Cửa sổ chấm điểm đã đóng mà không ghi thêm điểm.',
      );
      acceptedVoteRef.current = null;
      setLastAcceptedVote(null);
      voteSubmissionInFlightRef.current = false;
      setSubmittingVote(null);
      socket.emit(RealtimeEvent.MATCH_STATE_REQUEST);
    }

    function handleScoreUpdated(payload: ScoreUpdatedPayload): void {
      if (payload.matchPublicId !== matchPublicId) {
        return;
      }

      const scoresByAthlete = new Map(
        payload.scores.map((score) => [score.athleteId, score.score]),
      );
      setSnapshot((currentSnapshot) =>
        currentSnapshot
          ? {
              ...currentSnapshot,
              athletes: currentSnapshot.athletes.map((athlete) => ({
                ...athlete,
                score: scoresByAthlete.get(athlete.id) ?? athlete.score,
              })),
              generatedAt: payload.updatedAt,
            }
          : null,
      );
      socket.emit(RealtimeEvent.MATCH_STATE_REQUEST);
    }

    function handlePenaltyAdded(payload: PenaltyAddedPayload): void {
      if (payload.matchPublicId === matchPublicId) {
        setPenaltyErrorMessage(null);
        socket.emit(RealtimeEvent.MATCH_STATE_REQUEST);
      }
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on(RealtimeEvent.MATCH_STATE, handleMatchState);
    socket.on(RealtimeEvent.PENALTY_ADDED, handlePenaltyAdded);
    socket.on(RealtimeEvent.MATCH_FINISHED, handleMatchFinished);
    socket.on(RealtimeEvent.PRESENCE_UPDATED, handlePresenceUpdated);
    socket.on(RealtimeEvent.ROUND_ENDED, handleRoundEnded);
    socket.on(RealtimeEvent.ROUND_STARTED, handleRoundStarted);
    socket.on(RealtimeEvent.SCORE_UPDATED, handleScoreUpdated);
    socket.on(RealtimeEvent.SCORING_WINDOW_OPENED, handleScoringWindowOpened);
    socket.on(RealtimeEvent.SCORING_WINDOW_RESOLVED, handleScoringWindowResolved);
    socket.on(RealtimeEvent.SESSION_REVOKED, handleSessionRevoked);
    socket.on(RealtimeEvent.VOTE_ACCEPTED, handleVoteAccepted);
    socket.on(RealtimeEvent.VOTE_REJECTED, handleVoteRejected);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.io.on('reconnect_failed', handleReconnectFailed);

    if (socket.connected) {
      handleConnect();
    } else {
      setConnectionStatus('connecting');
      socket.connect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off(RealtimeEvent.MATCH_STATE, handleMatchState);
      socket.off(RealtimeEvent.PENALTY_ADDED, handlePenaltyAdded);
      socket.off(RealtimeEvent.MATCH_FINISHED, handleMatchFinished);
      socket.off(RealtimeEvent.PRESENCE_UPDATED, handlePresenceUpdated);
      socket.off(RealtimeEvent.ROUND_ENDED, handleRoundEnded);
      socket.off(RealtimeEvent.ROUND_STARTED, handleRoundStarted);
      socket.off(RealtimeEvent.SCORE_UPDATED, handleScoreUpdated);
      socket.off(RealtimeEvent.SCORING_WINDOW_OPENED, handleScoringWindowOpened);
      socket.off(RealtimeEvent.SCORING_WINDOW_RESOLVED, handleScoringWindowResolved);
      socket.off(RealtimeEvent.SESSION_REVOKED, handleSessionRevoked);
      socket.off(RealtimeEvent.VOTE_ACCEPTED, handleVoteAccepted);
      socket.off(RealtimeEvent.VOTE_REJECTED, handleVoteRejected);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.io.off('reconnect_failed', handleReconnectFailed);
      socket.disconnect();
    };
  }, [matchPublicId, refereeSlot]);

  return {
    connectionStatus,
    connect,
    disconnect,
    errorMessage,
    lastAcceptedVote,
    presence,
    reconnect,
    requestSnapshot,
    submitPenalty,
    roundStartErrorMessage,
    scoringWindowMessage,
    snapshot,
    startRound,
    startingRound,
    submitVote,
    submittingVote,
    submittingPenalty,
    penaltyErrorMessage,
    voteSubmitErrorMessage,
  };
}
