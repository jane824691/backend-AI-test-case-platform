import { Injectable } from '@nestjs/common';
import { stubResponse } from '../../common/http/api-response';
import { RegenerateRequirementDto } from './dto/regenerate-requirement.dto';
import { UploadRequirementDto } from './dto/upload-requirement.dto';

@Injectable()
export class RequirementsService {
  upload(projectId: string, input: UploadRequirementDto) {
    return stubResponse({
      projectId,
      accepted: true,
      changeSummary: input.changeSummary ?? null,
      message: 'Persistence, section parsing, and AI draft generation are pending adapters.',
    });
  }

  listVersions(projectId: string) {
    return stubResponse({ projectId, items: [] });
  }

  diff(projectId: string, versionId: string) {
    return stubResponse({ projectId, requirementVersionId: versionId, sections: [] });
  }

  regenerate(projectId: string, versionId: string, input: RegenerateRequirementDto) {
    return stubResponse({
      projectId,
      requirementVersionId: versionId,
      sectionKeys: input.sectionKeys ?? [],
      queued: true,
    });
  }
}

