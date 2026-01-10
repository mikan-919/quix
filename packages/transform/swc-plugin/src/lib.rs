use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::*,
        visit::{as_folder, FoldWith, VisitMut, VisitMutWith},
    },
    plugin::{plugin_transform, proxies::TransformPluginProgramMetadata},
    quote,
};

pub struct TransformVisitor {
    found_h: bool,
    used_jsx: bool,
}

impl TransformVisitor {
    pub fn new() -> Self {
        Self {
            found_h: false,
            used_jsx: false,
        }
    }
}

impl VisitMut for TransformVisitor {
    fn visit_mut_module(&mut self, module: &mut Module) {
        // インポートチェック（変更なし）
        for item in &module.body {
            if let ModuleItem::ModuleDecl(ModuleDecl::Import(import_decl)) = item {
                for specifier in &import_decl.specifiers {
                    if let ImportSpecifier::Named(named) = specifier {
                        if named.local.sym == "h" {
                            self.found_h = true;
                        }
                    }
                    if let ImportSpecifier::Default(def) = specifier {
                        if def.local.sym == "h" {
                            self.found_h = true;
                        }
                    }
                }
            }
        }

        module.visit_mut_children_with(self);

        // 自動インポート（変更なし）
        if self.used_jsx && !self.found_h {
            let import_stmt = ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                span: DUMMY_SP,
                specifiers: vec![ImportSpecifier::Named(ImportNamedSpecifier {
                    span: DUMMY_SP,
                    local: Ident::new("h".into(), DUMMY_SP),
                    imported: None,
                    is_type_only: false,
                })],
                src: Box::new(Str {
                    span: DUMMY_SP,
                    value: "@quix/runtime".into(),
                    raw: None,
                }),
                type_only: false,
                with: None,
                phase: ImportPhase::Evaluation,
            }));
            module.body.insert(0, import_stmt);
        }
    }

    fn visit_mut_expr(&mut self, expr: &mut Expr) {
        expr.visit_mut_children_with(self);

        if let Expr::JSXElement(jsx_el) = expr {
            self.used_jsx = true;

            // ▼▼▼ 修正箇所: タグ名の判定ロジック ▼▼▼
            let tag_expr = match &jsx_el.opening.name {
                // 識別子 (div, Display, etc.)
                JSXElementName::Ident(ident) => {
                    let name = ident.sym.as_str();
                    // 先頭が小文字なら文字列、それ以外（大文字）なら変数として扱う
                    if name.chars().next().map_or(false, |c| c.is_lowercase()) {
                        Expr::Lit(Lit::Str(Str {
                            span: DUMMY_SP,
                            value: ident.sym.clone(),
                            raw: None,
                        }))
                    } else {
                        Expr::Ident(ident.clone())
                    }
                }
                // メンバー式 (MyLib.Component)
                JSXElementName::JSXMemberExpr(member) => {
                    convert_jsx_member(member)
                }
                // 名前空間 (<svg:path />) は今回は未対応としてリターン
                JSXElementName::JSXNamespacedName(_) => return,
            };
            // ▲▲▲ 修正ここまで ▲▲▲

            let mut props_props = Vec::new();

            for attr in &jsx_el.opening.attrs {
                if let JSXAttrOrSpread::JSXAttr(attr) = attr {
                    let key_str = match &attr.name {
                        JSXAttrName::Ident(i) => i.sym.clone(),
                        _ => continue,
                    };

                    let value = match &attr.value {
                        Some(JSXAttrValue::JSXExprContainer(container)) => {
                            match &container.expr {
                                JSXExpr::Expr(e) => {
                                    if key_str.starts_with("on") {
                                        *e.clone()
                                    } else if matches!(**e, Expr::Arrow(_)) {
                                        *e.clone()
                                    } else {
                                        create_arrow_function(*e.clone())
                                    }
                                }
                                _ => continue,
                            }
                        }
                        Some(JSXAttrValue::Lit(lit)) => Expr::Lit(lit.clone()),
                        Some(JSXAttrValue::JSXElement(el)) => {
                            let mut converted = Expr::JSXElement(el.clone());
                            converted.visit_mut_with(self);

                            if key_str.starts_with("on") {
                                converted
                            } else {
                                create_arrow_function(converted)
                            }
                        }
                        Some(JSXAttrValue::JSXFragment(frag)) => {
                             let mut converted = Expr::JSXFragment(frag.clone());
                             converted.visit_mut_with(self);

                             if key_str.starts_with("on") {
                                 converted
                             } else {
                                 create_arrow_function(converted)
                             }
                        }
                        None => Expr::Lit(Lit::Bool(Bool { span: DUMMY_SP, value: true })),
                    };

                    props_props.push(PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                        key: PropName::Ident(Ident::new(key_str, DUMMY_SP)),
                        value: Box::new(value),
                    }))));
                }
            }

            let mut children_args = Vec::new();
            for child in &jsx_el.children {
                match child {
                    JSXElementChild::JSXExprContainer(container) => {
                        if let JSXExpr::Expr(e) = &container.expr {
                            if matches!(**e, Expr::Arrow(_)) {
                                children_args.push(ExprOrSpread {
                                    spread: None,
                                    expr: Box::new(*e.clone()),
                                });
                            } else {
                                children_args.push(ExprOrSpread {
                                    spread: None,
                                    expr: Box::new(create_arrow_function(*e.clone())),
                                });
                            }
                        }
                    }
                    JSXElementChild::JSXText(text) => {
                        let t = text.value.trim();
                        if !t.is_empty() {
                            children_args.push(ExprOrSpread {
                                spread: None,
                                expr: Box::new(Expr::Lit(Lit::Str(Str {
                                    span: DUMMY_SP,
                                    value: t.into(),
                                    raw: None,
                                }))),
                            });
                        }
                    }
                    JSXElementChild::JSXElement(el) => {
                        let mut converted_expr = Expr::JSXElement(el.clone());
                        converted_expr.visit_mut_with(self);
                        children_args.push(ExprOrSpread {
                            spread: None,
                            expr: Box::new(converted_expr),
                        });
                    }
                    _ => {}
                }
            }

            let mut args = vec![
                // 第1引数: タグ（判定後の式を使用）
                ExprOrSpread {
                    spread: None,
                    expr: Box::new(tag_expr),
                },
                // 第2引数: Props
                ExprOrSpread {
                    spread: None,
                    expr: Box::new(Expr::Object(ObjectLit {
                        span: DUMMY_SP,
                        props: props_props,
                    })),
                },
            ];
            args.extend(children_args);

            *expr = Expr::Call(CallExpr {
                span: DUMMY_SP,
                callee: Callee::Expr(Box::new(Expr::Ident(Ident::new("h".into(), DUMMY_SP)))),
                args,
                type_args: None,
            });
        }
    }
}

// JSXMemberExpr (Foo.Bar) を通常の MemberExpr に変換するヘルパー
fn convert_jsx_member(member: &JSXMemberExpr) -> Expr {
    let obj = match &member.obj {
        JSXObject::Ident(ident) => Expr::Ident(ident.clone()),
        JSXObject::JSXMemberExpr(nested) => convert_jsx_member(nested),
    };
    Expr::Member(MemberExpr {
        span: DUMMY_SP,
        obj: Box::new(obj),
        prop: MemberProp::Ident(member.prop.clone()),
    })
}

fn create_arrow_function(expr: Expr) -> Expr {
    quote!("() => $expr" as Expr, expr: Expr = expr)
}

#[plugin_transform]
pub fn process_transform(program: Program, _metadata: TransformPluginProgramMetadata) -> Program {
    program.fold_with(&mut as_folder(TransformVisitor::new()))
}