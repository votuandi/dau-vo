import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RealtimeEvent,
  type AthleteColor,
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
  type RoundControlErrorCode,
  type RoundControlResponse,
  type RoundPausedPayload,
  type ResultCancellationErrorCode,
  type ResultCancellationPayload,
  type ResultCancellationResponse,
  type ResultCancellationUndoPayload,
  type ResultCancellationUndoErrorCode,
  type ResultCancellationUndoResponse,
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
import { toast } from '@/components/ui/toast';

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
  readonly pauseRound: () => Promise<boolean>;
  readonly resumeRound: () => Promise<boolean>;
  readonly controllingRound: boolean;
  readonly roundControlErrorMessage: string | null;
  readonly cancelRoundResult: () => Promise<boolean>;
  readonly resetMatchResults: () => Promise<boolean>;
  readonly undoResultCancellation: (operationId: string) => Promise<boolean>;
  readonly cancellingResults: boolean;
  readonly resultCancellationErrorMessage: string | null;
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
    case 'SPORT_GROUP_RULES_NOT_IMPLEMENTED':
      return 'Luật thi đấu cho nhóm môn này chưa được triển khai.';
    case 'REALTIME_AUTHENTICATION_REQUIRED':
      return 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.';
    case 'ROUND_START_FORBIDDEN':
      return 'Chỉ giám định viên được phép bắt đầu hiệp đấu.';
    case 'MATCH_PARTICIPANTS_NOT_READY':
      return 'Chưa thể bắt đầu hiệp đấu. Cần kết nối đủ 3 trọng tài và ít nhất 1 bảng điểm.';
    case 'ROUND_START_INVALID_STATE':
      return 'Không thể bắt đầu hiệp từ trạng thái hiện tại. Trạng thái mới nhất đang được tải lại.';
    case 'ROUND_START_FAILED':
      return fallback;
  }
}

function getRoundControlErrorMessage(code: RoundControlErrorCode, fallback: string): string {
  switch (code) {
    case 'SPORT_GROUP_RULES_NOT_IMPLEMENTED':
      return 'Luật thi đấu cho nhóm môn này chưa được triển khai.';
    case 'REALTIME_AUTHENTICATION_REQUIRED':
      return 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.';
    case 'ROUND_CONTROL_FORBIDDEN':
      return 'Chỉ giám định viên được phép tạm dừng hoặc tiếp tục hiệp đấu.';
    case 'ROUND_CONTROL_INVALID_STATE':
      return 'Trạng thái hiệp đấu đã thay đổi. Dữ liệu mới nhất đang được tải lại.';
    case 'ROUND_CONTROL_FAILED':
      return fallback;
  }
}

function getResultCancellationErrorMessage(
  code: ResultCancellationErrorCode,
  fallback: string,
): string {
  switch (code) {
    case 'SPORT_GROUP_RULES_NOT_IMPLEMENTED':
      return 'Luật thi đấu cho nhóm môn này chưa được triển khai.';
    case 'REALTIME_AUTHENTICATION_REQUIRED':
      return 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.';
    case 'RESULT_CANCELLATION_FORBIDDEN':
      return 'Chỉ giám định viên được phép hủy kết quả.';
    case 'RESULT_CANCELLATION_INVALID_STATE':
      return 'Không thể hủy kết quả từ trạng thái hiện tại. Dữ liệu mới nhất đang được tải lại.';
    case 'BRACKET_PROGRESSION_LOCKED':
      return 'Không thể đặt lại kết quả vì trận đấu vòng tiếp theo đã được chuẩn bị. Hãy liên hệ quản trị viên.';
    case 'RESULT_CANCELLATION_FAILED':
      return fallback;
  }
}

function getResultCancellationUndoErrorMessage(
  code: ResultCancellationUndoErrorCode,
  fallback: string,
): string {
  switch (code) {
    case 'SPORT_GROUP_RULES_NOT_IMPLEMENTED':
      return 'Luật thi đấu cho nhóm môn này chưa được triển khai.';
    case 'REALTIME_AUTHENTICATION_REQUIRED':
      return 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.';
    case 'RESET_UNDO_FORBIDDEN':
      return 'Chỉ giám định viên được phép hoàn tác kết quả.';
    case 'RESET_UNDO_NOT_ALLOWED':
      return 'Không thể hoàn tác vì trận đấu đã có hoạt động mới hoặc thao tác này đã được hoàn tác.';
    case 'BRACKET_PROGRESSION_LOCKED':
      return 'Không thể hoàn tác vì trận đấu vòng tiếp theo đã được chuẩn bị.';
    case 'RESET_UNDO_FAILED':
      return fallback;
  }
}

function getVoteSubmitErrorMessage(code: VoteSubmitErrorCode, fallback: string): string {
  switch (code) {
    case 'SPORT_GROUP_RULES_NOT_IMPLEMENTED':
      return 'Luật thi đấu cho nhóm môn này chưa được triển khai.';
    case 'REALTIME_AUTHENTICATION_REQUIRED':
      return 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.';
    case 'VOTE_FORBIDDEN':
      return 'Chỉ trọng tài được phép gửi lựa chọn chấm điểm.';
    case 'VOTE_INVALID_ATHLETE':
      return 'Lựa chọn võ sĩ không hợp lệ.';
    case 'VOTE_MATCH_NOT_RUNNING':
      return 'Chỉ có thể chấm điểm khi hiệp đấu đang diễn ra.';
    case 'ROUND_PAUSED':
      return 'Không thể chấm điểm khi hiệp đấu đang tạm dừng.';
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
    case 'SPORT_GROUP_RULES_NOT_IMPLEMENTED':
      return 'Luật thi đấu cho nhóm môn này chưa được triển khai.';
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
  const [controllingRound, setControllingRound] = useState(false);
  const [roundControlErrorMessage, setRoundControlErrorMessage] = useState<string | null>(null);
  const [cancellingResults, setCancellingResults] = useState(false);
  const [resultCancellationErrorMessage, setResultCancellationErrorMessage] = useState<
    string | null
  >(null);
  const [submittingVote, setSubmittingVote] = useState<AthleteColor | null>(null);
  const [submittingPenalty, setSubmittingPenalty] = useState<AthleteColor | null>(null);
  const [penaltyErrorMessage, setPenaltyErrorMessage] = useState<string | null>(null);
  const [voteSubmitErrorMessage, setVoteSubmitErrorMessage] = useState<string | null>(null);
  const acceptedVoteRef = useRef<VoteAcceptedPayload | null>(null);
  const onAuthenticationRequiredRef = useRef(onAuthenticationRequired);
  const onSessionRevokedRef = useRef(onSessionRevoked);
  const penaltySubmissionInFlightRef = useRef(false);
  const roundStartInFlightRef = useRef(false);
  const roundControlInFlightRef = useRef(false);
  const resultCancellationInFlightRef = useRef(false);
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
    if (roundStartInFlightRef.current) {
      return;
    }
    if (!socket.connected) {
      setRoundStartErrorMessage(
        'Chưa kết nối với máy chủ. Vui lòng kết nối lại trước khi bắt đầu hiệp.',
      );
      return;
    }

    roundStartInFlightRef.current = true;
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
      roundStartInFlightRef.current = false;
      setStartingRound(false);
    }
  }, []);

  const controlRound = useCallback(async (action: 'pause' | 'resume'): Promise<boolean> => {
    const socket = getSocketClient();
    if (roundControlInFlightRef.current) return false;
    if (!socket.connected) {
      const message =
        'Chưa kết nối với máy chủ. Vui lòng kết nối lại trước khi điều khiển hiệp đấu.';
      setRoundControlErrorMessage(message);
      toast({
        title: action === 'pause' ? 'Không thể tạm dừng hiệp đấu.' : 'Không thể tiếp tục hiệp đấu.',
        variant: 'destructive',
      });
      return false;
    }
    roundControlInFlightRef.current = true;
    setControllingRound(true);
    setRoundControlErrorMessage(null);
    try {
      const event = action === 'pause' ? RealtimeEvent.ROUND_PAUSE : RealtimeEvent.ROUND_RESUME;
      const response = await new Promise<RoundControlResponse>((resolve, reject) => {
        socket
          .timeout(10_000)
          .emit(event, (error: Error | null, acknowledgement: RoundControlResponse) => {
            if (error) {
              reject(error);
            } else {
              resolve(acknowledgement);
            }
          });
      });
      if (!response.ok) {
        const message = getRoundControlErrorMessage(response.error.code, response.error.message);
        setRoundControlErrorMessage(message);
        toast({
          title:
            action === 'pause' ? 'Không thể tạm dừng hiệp đấu.' : 'Không thể tiếp tục hiệp đấu.',
          description: message,
          variant: 'destructive',
        });
        socket.emit(RealtimeEvent.MATCH_STATE_REQUEST);
        if (response.error.code === 'REALTIME_AUTHENTICATION_REQUIRED') {
          socket.disconnect();
          setConnectionStatus('authentication-required');
          onAuthenticationRequiredRef.current();
        }
        return false;
      }
      toast({
        title: action === 'pause' ? 'Đã tạm dừng hiệp đấu.' : 'Đã tiếp tục hiệp đấu.',
        variant: 'success',
      });
      socket.emit(RealtimeEvent.MATCH_STATE_REQUEST);
      return true;
    } catch {
      const message = 'Máy chủ không phản hồi. Vui lòng kiểm tra trạng thái hiệp đấu và thử lại.';
      setRoundControlErrorMessage(message);
      toast({
        title: action === 'pause' ? 'Không thể tạm dừng hiệp đấu.' : 'Không thể tiếp tục hiệp đấu.',
        description: message,
        variant: 'destructive',
      });
      return false;
    } finally {
      roundControlInFlightRef.current = false;
      setControllingRound(false);
    }
  }, []);
  const pauseRound = useCallback(() => controlRound('pause'), [controlRound]);
  const resumeRound = useCallback(() => controlRound('resume'), [controlRound]);

  const undoResultCancellation = useCallback(async (operationId: string): Promise<boolean> => {
    const socket = getSocketClient();
    if (resultCancellationInFlightRef.current) return false;
    if (!socket.connected) {
      const message = 'Chưa kết nối với máy chủ. Vui lòng kết nối lại trước khi hoàn tác.';
      setResultCancellationErrorMessage(message);
      toast({ title: 'Không thể hoàn tác kết quả.', description: message, variant: 'destructive' });
      return false;
    }
    resultCancellationInFlightRef.current = true;
    setCancellingResults(true);
    setResultCancellationErrorMessage(null);
    try {
      const response = await new Promise<ResultCancellationUndoResponse>((resolve, reject) => {
        socket
          .timeout(10_000)
          .emit(
            RealtimeEvent.RESULT_CANCELLATION_UNDO,
            { operationId },
            (error: Error | null, acknowledgement: ResultCancellationUndoResponse) => {
              if (error) reject(error);
              else resolve(acknowledgement);
            },
          );
      });
      if (!response.ok) {
        const message = getResultCancellationUndoErrorMessage(
          response.error.code,
          response.error.message,
        );
        setResultCancellationErrorMessage(message);
        toast({
          title: 'Không thể hoàn tác kết quả.',
          description: message,
          variant: 'destructive',
        });
        socket.emit(RealtimeEvent.MATCH_STATE_REQUEST);
        return false;
      }
      toast({ title: 'Đã khôi phục kết quả trước đó.', variant: 'success' });
      socket.emit(RealtimeEvent.MATCH_STATE_REQUEST);
      return true;
    } catch {
      const message = 'Máy chủ không phản hồi. Vui lòng kiểm tra trạng thái và thử lại.';
      setResultCancellationErrorMessage(message);
      toast({ title: 'Không thể hoàn tác kết quả.', description: message, variant: 'destructive' });
      return false;
    } finally {
      resultCancellationInFlightRef.current = false;
      setCancellingResults(false);
    }
  }, []);

  const changeResults = useCallback(
    async (entireMatch: boolean): Promise<boolean> => {
      const socket = getSocketClient();
      if (resultCancellationInFlightRef.current) return false;
      if (!socket.connected) {
        const message = 'Chưa kết nối với máy chủ. Vui lòng kết nối lại trước khi hủy kết quả.';
        setResultCancellationErrorMessage(message);
        toast({
          title: entireMatch
            ? 'Không thể đặt lại kết quả trận đấu.'
            : 'Không thể hủy kết quả hiệp.',
          description: message,
          variant: 'destructive',
        });
        return false;
      }
      resultCancellationInFlightRef.current = true;
      setCancellingResults(true);
      setResultCancellationErrorMessage(null);
      try {
        const event = entireMatch ? RealtimeEvent.MATCH_RESET : RealtimeEvent.ROUND_CANCEL;
        const response = await new Promise<ResultCancellationResponse>((resolve, reject) => {
          socket
            .timeout(10_000)
            .emit(event, (error: Error | null, acknowledgement: ResultCancellationResponse) => {
              if (error) reject(error);
              else resolve(acknowledgement);
            });
        });
        if (!response.ok) {
          const message = getResultCancellationErrorMessage(
            response.error.code,
            response.error.message,
          );
          setResultCancellationErrorMessage(message);
          toast({
            title: entireMatch
              ? 'Không thể đặt lại kết quả trận đấu.'
              : 'Không thể hủy kết quả hiệp.',
            description: message,
            variant: 'destructive',
          });
          socket.emit(RealtimeEvent.MATCH_STATE_REQUEST);
          if (response.error.code === 'REALTIME_AUTHENTICATION_REQUIRED') {
            socket.disconnect();
            setConnectionStatus('authentication-required');
            onAuthenticationRequiredRef.current();
          }
          return false;
        }
        toast({
          action: {
            label: 'HOÀN TÁC',
            onClick: () => {
              void undoResultCancellation(response.action.actionId);
            },
          },
          durationMs: 15_000,
          title: entireMatch
            ? 'Đã hủy kết quả trận đấu.'
            : `Đã hủy kết quả Hiệp ${String(response.action.roundNumbers[0] ?? '')}.`,
          variant: 'success',
        });
        socket.emit(RealtimeEvent.MATCH_STATE_REQUEST);
        return true;
      } catch {
        const message = 'Máy chủ không phản hồi. Vui lòng kiểm tra trạng thái và thử lại.';
        setResultCancellationErrorMessage(message);
        toast({
          title: entireMatch
            ? 'Không thể đặt lại kết quả trận đấu.'
            : 'Không thể hủy kết quả hiệp.',
          description: message,
          variant: 'destructive',
        });
        return false;
      } finally {
        resultCancellationInFlightRef.current = false;
        setCancellingResults(false);
      }
    },
    [undoResultCancellation],
  );
  const cancelRoundResult = useCallback(() => changeResults(false), [changeResults]);
  const resetMatchResults = useCallback(() => changeResults(true), [changeResults]);

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
    if (penaltySubmissionInFlightRef.current) {
      return;
    }
    if (!socket.connected) {
      setPenaltyErrorMessage('Chưa kết nối với máy chủ. Vui lòng kết nối lại trước khi ghi lỗi.');
      return;
    }

    penaltySubmissionInFlightRef.current = true;
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
      penaltySubmissionInFlightRef.current = false;
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
              scoreboardConnectedCount: payload.scoreboardConnectedCount,
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

    function handleRoundControl(payload: RoundPausedPayload): void {
      if (payload.matchPublicId === matchPublicId) {
        setRoundControlErrorMessage(null);
        socket.emit(RealtimeEvent.MATCH_STATE_REQUEST);
      }
    }

    function handleResultCancellation(
      payload: ResultCancellationPayload | ResultCancellationUndoPayload,
    ): void {
      if (payload.matchPublicId === matchPublicId) {
        acceptedVoteRef.current = null;
        setLastAcceptedVote(null);
        setResultCancellationErrorMessage(null);
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
    socket.on(RealtimeEvent.ROUND_PAUSED, handleRoundControl);
    socket.on(RealtimeEvent.ROUND_RESUMED, handleRoundControl);
    socket.on(RealtimeEvent.ROUND_CANCELLED, handleResultCancellation);
    socket.on(RealtimeEvent.MATCH_RESET_COMPLETED, handleResultCancellation);
    socket.on(RealtimeEvent.RESULT_CANCELLATION_UNDONE, handleResultCancellation);
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
      socket.off(RealtimeEvent.ROUND_PAUSED, handleRoundControl);
      socket.off(RealtimeEvent.ROUND_RESUMED, handleRoundControl);
      socket.off(RealtimeEvent.ROUND_CANCELLED, handleResultCancellation);
      socket.off(RealtimeEvent.MATCH_RESET_COMPLETED, handleResultCancellation);
      socket.off(RealtimeEvent.RESULT_CANCELLATION_UNDONE, handleResultCancellation);
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
    pauseRound,
    resumeRound,
    controllingRound,
    roundControlErrorMessage,
    cancelRoundResult,
    resetMatchResults,
    undoResultCancellation,
    cancellingResults,
    resultCancellationErrorMessage,
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
