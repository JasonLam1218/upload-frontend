class JobQueue {
  constructor() {
    this.jobs = new Map();
    this.cleanup();
  }

  createJob(type, data) {
    const jobId = this.generateJobId();
    const job = {
      id: jobId,
      type,
      status: 'pending',
      data,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      progress: 0,
      message: 'Job created',
      result: null,
      error: null
    };

    this.jobs.set(jobId, job);
    return jobId;
  }

  updateJob(jobId, updates) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    Object.assign(job, updates, { updatedAt: Date.now() });
    this.jobs.set(jobId, job);
    return true;
  }

  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  deleteJob(jobId) {
    return this.jobs.delete(jobId);
  }

  listJobs(limit = 50) {
    return Array.from(this.jobs.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  generateJobId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  cleanup() {
    // Clean up old jobs every hour
    setInterval(() => {
      const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
      for (const [jobId, job] of this.jobs.entries()) {
        if (job.createdAt < cutoff) {
          this.jobs.delete(jobId);
        }
      }
    }, 60 * 60 * 1000);
  }
}

module.exports = new JobQueue();
