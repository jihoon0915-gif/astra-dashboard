"""Decimal check of one explicit, authorized calculation table; no gold inputs."""
from decimal import Decimal, InvalidOperation, localcontext, ROUND_HALF_UP
import re

FORMULA = ('direct = prior rounded scoped direct + synthetic external + (public agreement gross / 1.1 if supplied); '
           'cost = direct*(1+overhead/100+contingency/100); target_net = cost/(1-margin/100); '
           'target_gross = unrounded target_net*1.1; final KRW HALF_UP')


def calculation_note(text):
    if not text.startswith('## calculation\n'):
        return None
    pairs=re.findall(r'^\| calculation / ([^|]+?) \| ([^|]*?) \|$',text,re.M)
    rows=dict(pairs)
    if len(rows)!=len(pairs):return None
    if rows.get('산식')!=FORMULA or rows.get('통화')!='KRW' or rows.get('VAT 기준')!='exclusive — VAT 제외':
        return None
    def number(key):
        value=rows[key]
        if not re.fullmatch(r'\d+(?:\.\d+)?',value):raise ValueError('not an explicit nonnegative number')
        return Decimal(value)
    try:
        with localcontext() as ctx:
            ctx.prec=40
            direct=number('scoped_direct_net');external=number('synthetic_external_net')
            overhead=number('overhead_percent');contingency=number('contingency_percent');margin=number('margin_percent')
            if margin>=100 or overhead>100 or contingency>100:return None
            if not rows.get('VAT 가정 요율','').startswith('10 percent'):return None
            agreement=rows.get('original_agreement_gross','')
            absent=agreement.startswith('null — ')
            agreement_net=Decimal(0) if absent else number('original_agreement_gross')/Decimal('1.1')
            cost=(direct+external+agreement_net)*(1+(overhead+contingency)/100)
            net=cost/(1-margin/100);gross=net*Decimal('1.1')
            krw=lambda x:format(x.quantize(Decimal('1'),rounding=ROUND_HALF_UP),',f')
            component=('공개협약 항목은 미설정이므로 명시 산식의 선택 항목에서 제외(실제 금액이 0이라는 뜻 아님)' if absent else f'공개협약 VAT 포함 {rows["original_agreement_gross"]} / 1.1')
            return (f'허용된 이 자료의 입력/명시 산식만 Decimal(정밀도40)로 검산한 파생값이다. 새 증빙이 아니다. '
                    f'직접비={direct}+{external}'+('' if absent else f'+({rows["original_agreement_gross"]}/1.1)')+
                    f'; {component}. 원가=직접비×(1+{overhead}/100+{contingency}/100). '
                    f'매출대비 마진 {margin}%는 원가에 {margin}%를 더하는 가산율이 아니며, 공급가=미반올림 원가/(1-{margin}/100). '
                    f'VAT 포함=미반올림 공급가×1.1. 최종 금액만 원 단위 HALF_UP: 원가 VAT 제외 {krw(cost)}원, '
                    f'공급가 VAT 제외 {krw(net)}원, VAT 포함 {krw(gross)}원. 합성 범위의 계산이며 실제 투찰가·증빙 확보가 아니다.')
    except (KeyError,ValueError,InvalidOperation):
        return None
