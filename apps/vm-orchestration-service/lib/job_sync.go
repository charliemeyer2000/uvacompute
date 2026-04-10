package lib

import (
	"log"
	"time"

	"vm-orchestration-service/structs"
)

func SyncJobsFromConvex(jobManager *structs.JobManager, jobAdapter *JobAdapter, callbackClient *CallbackClient) error {
	if callbackClient == nil {
		log.Printf("Skipping Convex job sync: callback client not configured")
		return nil
	}

	log.Printf("Starting Convex job sync...")

	convexJobs, err := callbackClient.FetchActiveJobs()
	if err != nil {
		return err
	}

	if len(convexJobs) == 0 {
		log.Printf("No active jobs found in Convex")
		return nil
	}

	currentJobs := jobManager.ListAllJobs()

	syncedCount, orphanedCount, cancellingCount := 0, 0, 0

	for _, cjob := range convexJobs {
		// Queued jobs have no K8s counterpart yet — handled by QueueProcessor.
		if cjob.Status == "queued" {
			continue
		}

		existingJob, existsInMemory := currentJobs[cjob.JobId]
		k8sStatus, err := jobAdapter.GetJobStatus(cjob.JobId)

		if cjob.Status == "cancelling" {
			if err != nil {
				log.Printf("SyncJobsFromConvex: job %s is cancelling but not in K8s, marking cancelled", cjob.JobId)
				if notifyErr := callbackClient.NotifyJobStatusUpdate(cjob.JobId, string(structs.JOB_STATUS_CANCELLED), nil, "", ""); notifyErr != nil {
					log.Printf("ERROR: Failed to notify site about cancelling job %s: %v", cjob.JobId, notifyErr)
				}
			} else {
				log.Printf("SyncJobsFromConvex: retrying deletion of cancelling job %s", cjob.JobId)
				if deleteErr := jobAdapter.DeleteJob(cjob.JobId); deleteErr == nil {
					if notifyErr := callbackClient.NotifyJobStatusUpdate(cjob.JobId, string(structs.JOB_STATUS_CANCELLED), nil, "", ""); notifyErr != nil {
						log.Printf("ERROR: Failed to notify site about cancelled job %s: %v", cjob.JobId, notifyErr)
					}
				} else {
					log.Printf("ERROR: Failed to delete cancelling job %s: %v - will retry next sync", cjob.JobId, deleteErr)
				}
			}
			cancellingCount++
			continue
		}

		if err != nil {
			log.Printf("Job %s exists in Convex (status: %s) but not in Kubernetes - marking as failed", cjob.JobId, cjob.Status)
			if cjob.Status != "failed" && cjob.Status != "completed" && cjob.Status != "cancelled" {
				if notifyErr := callbackClient.NotifyJobStatusUpdate(cjob.JobId, string(structs.JOB_STATUS_FAILED), nil, "Pod not found after service restart", ""); notifyErr != nil {
					log.Printf("ERROR: Failed to notify site about orphaned job %s: %v", cjob.JobId, notifyErr)
				}
				orphanedCount++
			}
			continue
		}

		nodeId := ""
		if cjob.NodeId != nil {
			nodeId = *cjob.NodeId
		}

		if !existsInMemory {
			name := ""
			if cjob.Name != nil {
				name = *cjob.Name
			}

			jobState := structs.JobState{
				Id:           cjob.JobId,
				Name:         name,
				UserId:       cjob.UserId,
				Image:        cjob.Image,
				Command:      cjob.Command,
				Env:          cjob.Env,
				Cpus:         cjob.Cpus,
				Ram:          cjob.Ram,
				Gpus:         cjob.Gpus,
				Disk:         cjob.Disk,
				Status:       k8sStatus,
				NodeId:       nodeId,
				CreationTime: time.UnixMilli(cjob.CreatedAt),
			}

			jobManager.AddJobFromExternal(cjob.JobId, jobState)
			existingJob = jobState
			syncedCount++
		}

		convexStatus := mapConvexJobStatusToJobStatus(cjob.Status)
		if k8sStatus != convexStatus {
			log.Printf("Job %s status mismatch (Convex: %s, K8s: %s) - updating Convex", cjob.JobId, cjob.Status, k8sStatus)

			if notifyErr := callbackClient.NotifyJobStatusUpdate(cjob.JobId, string(k8sStatus), existingJob.ExitCode, existingJob.ErrorMessage, nodeId); notifyErr != nil {
				log.Printf("ERROR: Failed to notify site about job %s status: %v", cjob.JobId, notifyErr)
			}
		}

		isTerminal := k8sStatus == structs.JOB_STATUS_COMPLETED ||
			k8sStatus == structs.JOB_STATUS_FAILED ||
			k8sStatus == structs.JOB_STATUS_CANCELLED

		if isTerminal && cjob.LogsStorageId == nil {
			log.Printf("Job %s is terminal but logs not archived - attempting archive", cjob.JobId)
			go func(jobId string, status structs.JobStatus, exitCode *int, errorMsg string, node string) {
				jobManager.UpdateJobStatus(jobId, status, exitCode, errorMsg, node)
			}(cjob.JobId, k8sStatus, existingJob.ExitCode, existingJob.ErrorMessage, nodeId)
		}
	}

	log.Printf("Convex job sync complete: %d jobs synced, %d orphaned jobs marked as failed, %d cancelling jobs processed",
		syncedCount, orphanedCount, cancellingCount)
	return nil
}

func mapConvexJobStatusToJobStatus(status string) structs.JobStatus {
	switch status {
	case "pending":
		return structs.JOB_STATUS_PENDING
	case "scheduled":
		return structs.JOB_STATUS_SCHEDULED
	case "pulling":
		return structs.JOB_STATUS_PULLING
	case "running":
		return structs.JOB_STATUS_RUNNING
	case "completed":
		return structs.JOB_STATUS_COMPLETED
	case "failed":
		return structs.JOB_STATUS_FAILED
	case "cancelled":
		return structs.JOB_STATUS_CANCELLED
	default:
		return structs.JOB_STATUS_PENDING
	}
}
