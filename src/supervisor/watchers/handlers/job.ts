import { V1Job, V1JobList } from '@kubernetes/client-node';
import { deleteWorkload, trimWorkload } from './workload';
import { WorkloadKind } from '../../types';
import { FALSY_WORKLOAD_NAME_MARKER } from './types';
import { IncomingMessage } from 'http';
import { k8sApi } from '../../cluster';
import { paginatedList } from './pagination';
import {
  deleteWorkloadAlreadyScanned,
  deleteWorkloadImagesAlreadyScanned,
  kubernetesObjectToWorkloadAlreadyScanned,
} from '../../../state';

export async function paginatedJobList(namespace: string): Promise<{
  response: IncomingMessage;
  body: V1JobList;
}> {
  const v1JobList = new V1JobList();
  v1JobList.apiVersion = 'batch/v1';
  v1JobList.kind = 'JobList';
  v1JobList.items = new Array<V1Job>();

  return await paginatedList(
    namespace,
    v1JobList,
    k8sApi.batchClient.listNamespacedJob.bind(k8sApi.batchClient),
  );
}

export async function jobWatchHandler(job: V1Job): Promise<void> {
  job = trimWorkload(job);

  if (
    !job.metadata ||
    !job.spec ||
    !job.spec.template.metadata ||
    !job.spec.template.spec
  ) {
    return;
  }

  const workloadAlreadyScanned = kubernetesObjectToWorkloadAlreadyScanned(job);
  if (workloadAlreadyScanned !== undefined) {
    await Promise.all([
      deleteWorkloadAlreadyScanned(workloadAlreadyScanned),
      deleteWorkloadImagesAlreadyScanned({
        ...workloadAlreadyScanned,
        imageIds: job.spec.template.spec.containers
          .filter((container) => container.image !== undefined)
          .map((container) => container.image!),
      }),
    ]);
  }

  const workloadName = job.metadata.name || FALSY_WORKLOAD_NAME_MARKER;

  await deleteWorkload(
    {
      kind: WorkloadKind.Job,
      objectMeta: job.metadata,
      specMeta: job.spec.template.metadata,
      ownerRefs: job.metadata.ownerReferences,
      podSpec: job.spec.template.spec,
    },
    workloadName,
  );
}
