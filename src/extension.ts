import * as vscode from 'vscode';

interface LanguagePattern {
    [language: string]: string;
}

export function activate(context: vscode.ExtensionContext) {
    const codelensProvider = new ImplementationsCodeLensProvider();
    
    // Register provider for all supported languages
    const supportedLanguages = vscode.workspace
        .getConfiguration('quickImplements')
        .get<string[]>('supportedLanguages', []);

    supportedLanguages.forEach(language => {
        context.subscriptions.push(
            vscode.languages.registerCodeLensProvider(
                { language, scheme: 'file' },
                codelensProvider
            )
        );
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('quick-implements.showImplementations', async (position: vscode.Position) => {
            const locations = await findImplementations(position);
            if (locations && locations.length > 0) {
                await showImplementationsQuickPick(locations);
            } else {
                vscode.window.showInformationMessage('No implementations found.');
            }
        })
    );
}

class ImplementationsCodeLensProvider implements vscode.CodeLensProvider {
    async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();
        
        // Get language-specific pattern
        const patterns = vscode.workspace
            .getConfiguration('quickImplements')
            .get<LanguagePattern>('interfacePatterns', {});
        
        const pattern = patterns[document.languageId];
        if (!pattern) {
            return codeLenses;
        }

        const interfaceRegex = new RegExp(pattern, 'g');
        let match;

        while ((match = interfaceRegex.exec(text))) {
            // The name group is always the last captured group in our patterns
            const nameGroup = match[match.length - 1];
            const startPos = document.positionAt(match.index + match[0].indexOf(nameGroup));
            const endPos = document.positionAt(match.index + match[0].indexOf(nameGroup) + nameGroup.length);
            const range = new vscode.Range(startPos, endPos);
            
            // Get implementation count
            const implementations = await findImplementations(startPos);
            const count = implementations ? implementations.length : 0;

            // Create appropriate icon and label based on language
            const icon = getLanguageIcon(document.languageId);
            
            const codeLens = new vscode.CodeLens(range, {
                title: `${icon} ${count} implementation${count !== 1 ? 's' : ''}`,
                command: 'quick-implements.showImplementations',
                arguments: [startPos]
            });
            codeLenses.push(codeLens);
        }

        return codeLenses;
    }
}

function getLanguageIcon(languageId: string): string {
    // Return language-specific icons
    const icons: { [key: string]: string } = {
        'go': '⚡',
        'java': '☕',
        'typescript': '💠',
        'csharp': '🔷',
        'python': '🐍',
        'rust': '⚙️'
    };
    return icons[languageId] || '📎';
}

async function findImplementations(position: vscode.Position): Promise<vscode.Location[]> {
    try {
        if (!vscode.window.activeTextEditor) {
            return [];
        }

        const implementations = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeImplementationProvider',
            vscode.window.activeTextEditor.document.uri,
            position
        );
        
        return (implementations || []).filter((loc): loc is vscode.Location => 
            loc !== null && loc !== undefined
        );
    } catch (error) {
        console.error('Error finding implementations:', error);
        return [];
    }
}

async function showImplementationsQuickPick(locations: vscode.Location[]) {
    const items = await Promise.all(locations.map(async (location) => {
        const document = await vscode.workspace.openTextDocument(location.uri);
        const lineText = document.lineAt(location.range.start.line).text.trim();
        
        return {
            label: `$(symbol-interface) ${lineText}`,
            description: `${vscode.workspace.asRelativePath(location.uri)}:${location.range.start.line + 1}`,
            detail: getImplementationDetails(document.languageId, lineText),
            location: location
        };
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select an implementation'
    });

    if (selected) {
        const document = await vscode.workspace.openTextDocument(selected.location.uri);
        await vscode.window.showTextDocument(document, {
            selection: selected.location.range
        });
    }
}

function getImplementationDetails(languageId: string, lineText: string): string {
    // Provide language-specific details about the implementation
    switch (languageId) {
        case 'go':
            return lineText.includes('struct') ? 'Struct Implementation' : 'Type Implementation';
        case 'java':
        case 'typescript':
            return lineText.includes('class') ? 'Class Implementation' : 'Interface Implementation';
        case 'python':
            return 'Class Implementation';
        case 'rust':
            return 'Trait Implementation';
        default:
            return 'Implementation';
    }
}

export function deactivate() {}