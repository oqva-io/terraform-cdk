import { CodeMaker, toCamelCase } from "codemaker";
import { Module, Submodule } from "../registry-client";

export class ModuleGenerator {
  constructor(private readonly code: CodeMaker, private readonly spec: Module) {
    this.code.indentation = 2;
    this.emitSubmodule(spec.root);
  }

  private emitSubmodule(spec: Submodule) {
    const source = `${this.spec.namespace}/${this.spec.name}/${this.spec.provider}`;
    const fileName = `modules/${source}.ts`;
    this.code.openFile(fileName);

    this.code.line(`// generated by cdktf get`);
    this.code.line(`// ${this.spec.id}/${spec.path}`);

    this.code.line(`import { TerraformModule } from 'cdktf';`);
    this.code.line(`import { Construct } from 'constructs';`);

    const baseName = this.code.toPascalCase(spec.name.replace(/-/g, '_'));
    const optionsType = `${baseName}Options`;

    this.code.openBlock(`export interface ${optionsType}`);
    for (const input of spec.inputs) {
      const optional = (input.required && (input.default === undefined)) ? '' : '?';
      this.code.line(`/**`);
      this.code.line(` * ${input.description}`);
      if (input.default) {
        this.code.line(` * @default ${input.default}`);
      }
      this.code.line(` */`);
      this.code.line(`readonly ${toCamelCase(input.name)}${optional}: ${parseType(input.type)};`);
    }
    this.code.closeBlock();

    this.code.openBlock(`export class ${baseName} extends TerraformModule`);

    this.code.line(`private readonly inputs: { [name: string]: any } = { }`);

    const allOptional = spec.inputs.find(x => x.required) ? '' : ' = {}';

    this.code.open(`public constructor(scope: Construct, id: string, options: ${optionsType}${allOptional}) {`);
    this.code.open(`super(scope, id, {`);
    this.code.line(`source: '${source}',`);
    this.code.line(`version: '${this.spec.version}',`);
    this.code.close(`});`);

    for (const input of spec.inputs) {
      const inputName = toCamelCase(input.name);
      this.code.line(`this.${inputName} = options.${inputName};`);
    }

    this.code.close(`}`); // ctor

    for (const input of spec.inputs) {
      const inputName = toCamelCase(input.name);
      const inputType = parseType(input.type) + ((input.required && (input.default === undefined)) ? '' : ' | undefined');
      this.code.openBlock(`public get ${inputName}(): ${inputType}`);
      this.code.line(`return this.inputs['${input.name}'] as ${inputType};`);
      this.code.closeBlock();

      this.code.openBlock(`public set ${inputName}(value: ${inputType})`);
      this.code.line(`this.inputs['${input.name}'] = value;`);
      this.code.closeBlock();
    }

    for (const output of spec.outputs) {
      const outputName = toCamelCase(output.name);
      this.code.openBlock(`public get ${outputName}Output(): string`);
      this.code.line(`return this.interpolationForOutput('${output.name}')`);
      this.code.closeBlock();
    }

    this.code.openBlock(`protected synthesizeAttributes()`);
    this.code.line(`return this.inputs;`);
    this.code.closeBlock();

    this.code.closeBlock(); // class

    this.code.closeFile(fileName);
  }

}

function parseType(type: string) {
  if (type === 'string') { return 'string'; }
  if (type === 'number') { return 'number'; }
  if (type === 'bool') { return 'boolean'; }
  if (type === 'list') { return 'string[]'; }
  if (type === 'map') { return '{ [key: string]: string }'; }
  if (type === 'any') { return 'any'; }

  const complexType = parseComplexType(type);
  if (complexType) { return complexType; }

  throw new Error(`unknown type ${type}`);
}

function parseComplexType(type: string): string | undefined {
  const complex = /^(object|list|map)\(([\s\S]+)\)/;
  const match = complex.exec(type);
  if (!match) {
    return undefined;
  }

  const [ , kind, innerType ] = match;

  if (kind === 'object') {
    return `any`;
  }

  if (kind === 'list') {
    return `${parseType(innerType)}[]`;
  }

  if (kind === 'map') {
    return `{ [key: string]: ${parseType(innerType) } }`;
  }

  throw new Error(`unexpected kind ${kind}`);
}