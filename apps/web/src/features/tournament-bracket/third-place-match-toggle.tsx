import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import {
  notifyMutationError,
  notifyMutationSuccess,
} from '@/features/admin-management/presentation';
import { tournamentQueryKeys } from '@/features/admin-management/queries';
import { adminManagementApi, type ActiveBracket } from '@/services/api/admin-management';
import { thirdPlaceLockReason } from './fixture-presentation';
import { bracketQueryKeys } from './query-keys';
import { settingsDescriptionClassName, settingsSubCardClassName } from './settings-card-styles';

/**
 * "Thực hiện trận tranh hạng 3": the two semi-final losers play for third place
 * before the final. Saved at once; it also adds or removes that match in the
 * weight class's active bracket.
 */
export function ThirdPlaceMatchToggle({
  bracket,
  initialEnabled,
  isReadOnly,
  tournamentId,
  weightClassId,
}: {
  readonly bracket: ActiveBracket | undefined;
  readonly initialEnabled: boolean;
  readonly isReadOnly: boolean;
  readonly tournamentId: string;
  readonly weightClassId: string;
}) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(initialEnabled);
  const update = useMutation({
    mutationFn: (next: boolean) =>
      adminManagementApi.updateThirdPlaceMatch(tournamentId, weightClassId, next),
    onSuccess: ({ weightClass }) => {
      setEnabled(weightClass.thirdPlaceMatchEnabled);
      void queryClient.invalidateQueries({
        queryKey: tournamentQueryKeys.weightClasses(tournamentId),
      });
      void queryClient.invalidateQueries({
        queryKey: bracketQueryKeys.detail(tournamentId, weightClassId),
      });
      notifyMutationSuccess(
        weightClass.thirdPlaceMatchEnabled
          ? 'Đã bật trận tranh hạng 3.'
          : 'Đã tắt trận tranh hạng 3.',
      );
    },
    onError: (error, next) => {
      setEnabled(!next);
      notifyMutationError(error, 'Không thể cập nhật trận tranh hạng 3.');
    },
  });
  const lockReason = thirdPlaceLockReason(bracket);
  const tooFewRounds = bracket !== undefined && bracket.bracket.roundCount < 2;

  return (
    <div className={settingsSubCardClassName}>
      <Switch
        checked={enabled}
        description="Hai VĐV thua ở vòng bán kết thi đấu tranh hạng 3 trước trận chung kết. Khi bật, Kết quả giải đấu chỉ có một hạng 3."
        disabled={isReadOnly || update.isPending || lockReason !== null}
        label="Thực hiện trận tranh hạng 3"
        onCheckedChange={(next) => {
          setEnabled(next);
          update.mutate(next);
        }}
      />
      {lockReason ? (
        <p className={`${settingsDescriptionClassName} text-warning`}>{lockReason}</p>
      ) : tooFewRounds && enabled ? (
        <p className={settingsDescriptionClassName}>
          Hạng cân này không có vòng bán kết nên không có trận tranh hạng 3.
        </p>
      ) : null}
    </div>
  );
}
