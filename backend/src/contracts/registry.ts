import type { TSchema } from "@sinclair/typebox";
import {
  CREATIVE_BRIEF_SCHEMA_VERSION,
  CreativeBriefSchema
} from "./creativeBrief.js";
import {
  CREATIVE_OUTPUT_SCHEMA_VERSION,
  CreativeOutputSchema
} from "./creativeOutput.js";
import {
  PROFILE_DIAGNOSTIC_SCHEMA_VERSION,
  ProfileDiagnosticSchema
} from "./profileDiagnostic.js";

export const CONTRACT_KEYS = {
  profileDiagnostic: "profile_diagnostic",
  creativeBrief: "creative_brief",
  creativeOutput: "creative_output"
} as const;

export type ContractKey = (typeof CONTRACT_KEYS)[keyof typeof CONTRACT_KEYS];

interface ContractDefinition {
  version: string;
  schema: TSchema;
}

const contractRegistry: Record<ContractKey, ContractDefinition> = {
  [CONTRACT_KEYS.profileDiagnostic]: {
    version: PROFILE_DIAGNOSTIC_SCHEMA_VERSION,
    schema: ProfileDiagnosticSchema
  },
  [CONTRACT_KEYS.creativeBrief]: {
    version: CREATIVE_BRIEF_SCHEMA_VERSION,
    schema: CreativeBriefSchema
  },
  [CONTRACT_KEYS.creativeOutput]: {
    version: CREATIVE_OUTPUT_SCHEMA_VERSION,
    schema: CreativeOutputSchema
  }
};

const builtInAgentContracts: Record<string, { contractKey: ContractKey; contractVersion: string }> = {
  brand_analyzer_agent: {
    contractKey: CONTRACT_KEYS.profileDiagnostic,
    contractVersion: PROFILE_DIAGNOSTIC_SCHEMA_VERSION
  },
  strategist_agent: {
    contractKey: CONTRACT_KEYS.creativeBrief,
    contractVersion: CREATIVE_BRIEF_SCHEMA_VERSION
  },
  creative_agent: {
    contractKey: CONTRACT_KEYS.creativeOutput,
    contractVersion: CREATIVE_OUTPUT_SCHEMA_VERSION
  }
};

export function resolveContractSchema(contractKey: string, contractVersion: string): TSchema {
  const definition = contractRegistry[contractKey as ContractKey];
  if (!definition) throw new Error(`Contrato oficial nao registrado: ${contractKey}.`);
  if (definition.version !== contractVersion) {
    throw new Error(`Versao ${contractVersion} nao registrada para o contrato ${contractKey}. Versao esperada: ${definition.version}.`);
  }
  return definition.schema;
}

export function validateAgentContractBinding(agentKey: string, contractKey: string, contractVersion: string): TSchema {
  const schema = resolveContractSchema(contractKey, contractVersion);
  const expected = builtInAgentContracts[agentKey];
  if (!expected) return schema;
  if (expected.contractKey !== contractKey || expected.contractVersion !== contractVersion) {
    throw new Error(
      `Contrato divergente para ${agentKey}. Esperado ${expected.contractKey}@${expected.contractVersion}; recebido ${contractKey}@${contractVersion}.`
    );
  }
  return schema;
}

export function getBuiltInAgentContract(agentKey: string) {
  return builtInAgentContracts[agentKey] ?? null;
}
